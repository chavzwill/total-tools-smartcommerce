import { neon } from "@neondatabase/serverless";
import { randomBytes } from "node:crypto";

let sqlClient: ReturnType<typeof neon> | undefined;
let schemaReady = false;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("DELIVERY_NOTIFICATION_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

export type DeliveryNotificationChannel = "in_app" | "email" | "sms" | "whatsapp";
export type DeliveryNotificationOutboxRow = {
  id:string; lifecycle_id:string; lifecycle_event_id:string; order_id:string; customer_id:string; status:string;
  channel:DeliveryNotificationChannel; subject:string|null; message:string; delivery_status:string; provider_message_id:string|null;
  attempt_count:number; last_error_code:string|null; next_attempt_at:string|Date|null; claimed_at:string|Date|null;
};

export async function ensureDeliveryNotificationSchema() {
  if (schemaReady) return;
  const db = sql();
  await db`
    CREATE TABLE IF NOT EXISTS delivery_notification_outbox (
      id TEXT PRIMARY KEY,
      lifecycle_id TEXT NOT NULL,
      lifecycle_event_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      status TEXT NOT NULL,
      channel TEXT NOT NULL,
      subject TEXT,
      message TEXT NOT NULL,
      delivery_status TEXT NOT NULL DEFAULT 'pending',
      provider_message_id TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error_code TEXT,
      next_attempt_at TIMESTAMPTZ,
      claimed_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await db`ALTER TABLE delivery_notification_outbox ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ`;
  await db`ALTER TABLE delivery_notification_outbox ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ`;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS delivery_notification_event_channel_uidx ON delivery_notification_outbox(lifecycle_event_id, channel)`;
  await db`CREATE INDEX IF NOT EXISTS delivery_notification_customer_idx ON delivery_notification_outbox(customer_id, created_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS delivery_notification_pending_idx ON delivery_notification_outbox(delivery_status, next_attempt_at, created_at ASC)`;
  await db`CREATE INDEX IF NOT EXISTS delivery_notification_provider_id_idx ON delivery_notification_outbox(provider_message_id) WHERE provider_message_id IS NOT NULL`;
  schemaReady = true;
}

function clean(value: unknown, max = 500) { return String(value || "").trim().slice(0, max); }
function channelEnabled(channel: Exclude<DeliveryNotificationChannel, "in_app">) {
  return String(process.env[`SMARTCOMMERCE_${channel.toUpperCase()}_NOTIFICATIONS_ENABLED`] || "").trim().toLowerCase() === "true";
}

export async function enqueueDeliveryNotification(input:{lifecycleId:string;lifecycleEventId:string;orderId:string;customerId:string;status:string;message:string}) {
  await ensureDeliveryNotificationSchema();
  const message = clean(input.message, 700);
  if (!message) return [];
  const channels:DeliveryNotificationChannel[]=["in_app"];
  if(channelEnabled("email"))channels.push("email");
  if(channelEnabled("sms"))channels.push("sms");
  if(channelEnabled("whatsapp"))channels.push("whatsapp");
  const rows:any[]=[];
  for(const channel of channels){
    const id=`dno_${randomBytes(16).toString("hex")}`;
    const deliveryStatus=channel==="in_app"?"delivered":"pending";
    const inserted=await sql()`
      INSERT INTO delivery_notification_outbox(id,lifecycle_id,lifecycle_event_id,order_id,customer_id,status,channel,subject,message,delivery_status,sent_at,next_attempt_at)
      VALUES(${id},${input.lifecycleId},${input.lifecycleEventId},${input.orderId},${input.customerId},${clean(input.status,40)},${channel},${`Order ${clean(input.orderId,120)} update`},${message},${deliveryStatus},${channel==="in_app"?new Date().toISOString():null},${channel==="in_app"?null:new Date().toISOString()})
      ON CONFLICT (lifecycle_event_id,channel) DO NOTHING RETURNING *
    ` as unknown as any[];
    if(inserted[0])rows.push(inserted[0]);
  }
  return rows;
}

export async function enqueueLatestDeliveryEventNotification(orderId:string){
  await ensureDeliveryNotificationSchema();
  const rows=await sql()`SELECT l.id lifecycle_id,l.order_id,l.customer_id,e.id event_id,e.status,e.public_message FROM delivery_lifecycles l JOIN delivery_lifecycle_events e ON e.lifecycle_id=l.id WHERE l.order_id=${clean(orderId,180)} AND COALESCE(e.public_message,'')<>'' ORDER BY e.created_at DESC LIMIT 1` as unknown as any[];
  const event=rows[0]; if(!event)return [];
  return enqueueDeliveryNotification({lifecycleId:event.lifecycle_id,lifecycleEventId:event.event_id,orderId:event.order_id,customerId:event.customer_id,status:event.status,message:event.public_message});
}

export async function listCustomerDeliveryNotifications(customerId:string,orderId?:string){
  await ensureDeliveryNotificationSchema(); const order=clean(orderId,180);
  if(order)return await sql()`SELECT id,order_id,status,channel,subject,message,delivery_status,sent_at,read_at,created_at FROM delivery_notification_outbox WHERE customer_id=${customerId} AND channel='in_app' AND order_id=${order} ORDER BY created_at DESC LIMIT 100` as unknown as any[];
  return await sql()`SELECT id,order_id,status,channel,subject,message,delivery_status,sent_at,read_at,created_at FROM delivery_notification_outbox WHERE customer_id=${customerId} AND channel='in_app' ORDER BY created_at DESC LIMIT 100` as unknown as any[];
}

export async function markCustomerDeliveryNotificationRead(input:{id:string;customerId:string}){
  await ensureDeliveryNotificationSchema();
  const rows=await sql()`UPDATE delivery_notification_outbox SET read_at=COALESCE(read_at,NOW()),updated_at=NOW() WHERE id=${clean(input.id,120)} AND customer_id=${input.customerId} AND channel='in_app' RETURNING id,read_at` as unknown as any[];
  return rows[0]||null;
}

export async function claimPendingExternalDeliveryNotifications(limit=20){
  await ensureDeliveryNotificationSchema(); const capped=Math.max(1,Math.min(50,Math.trunc(limit)));
  return await sql()`
    WITH candidates AS (
      SELECT id FROM delivery_notification_outbox
      WHERE channel<>'in_app'
        AND ((delivery_status IN ('pending','retry') AND COALESCE(next_attempt_at,NOW())<=NOW()) OR (delivery_status='processing' AND claimed_at<NOW()-INTERVAL '5 minutes'))
      ORDER BY created_at ASC LIMIT ${capped} FOR UPDATE SKIP LOCKED
    )
    UPDATE delivery_notification_outbox n
    SET delivery_status='processing',claimed_at=NOW(),attempt_count=attempt_count+1,updated_at=NOW()
    FROM candidates c WHERE n.id=c.id RETURNING n.*
  ` as unknown as DeliveryNotificationOutboxRow[];
}

export async function markExternalNotificationAccepted(input:{id:string;providerMessageId:string;providerStatus?:string}){
  await ensureDeliveryNotificationSchema();
  await sql()`UPDATE delivery_notification_outbox SET delivery_status=${clean(input.providerStatus,40)||"accepted"},provider_message_id=${clean(input.providerMessageId,180)},last_error_code=NULL,claimed_at=NULL,sent_at=COALESCE(sent_at,NOW()),updated_at=NOW() WHERE id=${clean(input.id,120)}`;
}

export async function markExternalNotificationRetry(input:{id:string;errorCode:string;delaySeconds:number}){
  await ensureDeliveryNotificationSchema(); const delay=Math.max(60,Math.min(86400,Math.trunc(input.delaySeconds)));
  await sql()`UPDATE delivery_notification_outbox SET delivery_status='retry',last_error_code=${clean(input.errorCode,120)},claimed_at=NULL,next_attempt_at=NOW()+(${delay}*INTERVAL '1 second'),updated_at=NOW() WHERE id=${clean(input.id,120)}`;
}

export async function markExternalNotificationUncertain(input:{id:string;errorCode:string}){
  await ensureDeliveryNotificationSchema();
  await sql()`UPDATE delivery_notification_outbox SET delivery_status='uncertain',last_error_code=${clean(input.errorCode,120)},claimed_at=NULL,updated_at=NOW() WHERE id=${clean(input.id,120)}`;
}

export async function reconcileExternalNotification(input:{providerMessageId:string;deliveryStatus:string;errorCode?:string|null}){
  await ensureDeliveryNotificationSchema(); const providerId=clean(input.providerMessageId,180); if(!providerId)return null;
  const normalized=clean(input.deliveryStatus,40)||"unknown"; const success=["sent","delivered","read"].includes(normalized); const failed=["failed","undelivered","bounced","complained"].includes(normalized);
  const rows=await sql()`UPDATE delivery_notification_outbox SET delivery_status=${normalized},last_error_code=${clean(input.errorCode,120)||null},claimed_at=NULL,sent_at=CASE WHEN ${success} THEN COALESCE(sent_at,NOW()) ELSE sent_at END,next_attempt_at=CASE WHEN ${failed} THEN NULL ELSE next_attempt_at END,updated_at=NOW() WHERE provider_message_id=${providerId} RETURNING id,order_id,customer_id,channel,delivery_status` as unknown as any[];
  return rows[0]||null;
}
