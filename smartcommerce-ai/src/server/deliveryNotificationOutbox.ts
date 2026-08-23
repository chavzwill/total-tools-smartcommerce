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
      sent_at TIMESTAMPTZ,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS delivery_notification_event_channel_uidx ON delivery_notification_outbox(lifecycle_event_id, channel)`;
  await db`CREATE INDEX IF NOT EXISTS delivery_notification_customer_idx ON delivery_notification_outbox(customer_id, created_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS delivery_notification_pending_idx ON delivery_notification_outbox(delivery_status, created_at ASC)`;
  schemaReady = true;
}

function clean(value: unknown, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function channelEnabled(channel: Exclude<DeliveryNotificationChannel, "in_app">) {
  const key = `SMARTCOMMERCE_${channel.toUpperCase()}_NOTIFICATIONS_ENABLED`;
  return String(process.env[key] || "").trim().toLowerCase() === "true";
}

export async function enqueueDeliveryNotification(input: {
  lifecycleId: string;
  lifecycleEventId: string;
  orderId: string;
  customerId: string;
  status: string;
  message: string;
}) {
  await ensureDeliveryNotificationSchema();
  const message = clean(input.message, 700);
  if (!message) return [];

  const channels: DeliveryNotificationChannel[] = ["in_app"];
  if (channelEnabled("email")) channels.push("email");
  if (channelEnabled("sms")) channels.push("sms");
  if (channelEnabled("whatsapp")) channels.push("whatsapp");

  const rows: any[] = [];
  for (const channel of channels) {
    const id = `dno_${randomBytes(16).toString("hex")}`;
    const deliveryStatus = channel === "in_app" ? "delivered" : "pending";
    const inserted = await sql()`
      INSERT INTO delivery_notification_outbox (
        id, lifecycle_id, lifecycle_event_id, order_id, customer_id,
        status, channel, subject, message, delivery_status, sent_at
      ) VALUES (
        ${id}, ${input.lifecycleId}, ${input.lifecycleEventId}, ${input.orderId}, ${input.customerId},
        ${clean(input.status, 40)}, ${channel}, ${`Order ${clean(input.orderId, 120)} update`}, ${message},
        ${deliveryStatus}, ${channel === "in_app" ? new Date().toISOString() : null}
      )
      ON CONFLICT (lifecycle_event_id, channel) DO NOTHING
      RETURNING *
    ` as unknown as any[];
    if (inserted[0]) rows.push(inserted[0]);
  }
  return rows;
}

export async function listCustomerDeliveryNotifications(customerId: string, orderId?: string) {
  await ensureDeliveryNotificationSchema();
  const order = clean(orderId, 180);
  return await sql()`
    SELECT id, order_id, status, channel, subject, message, delivery_status, sent_at, read_at, created_at
    FROM delivery_notification_outbox
    WHERE customer_id = ${customerId}
      AND channel = 'in_app'
      ${order ? sql()`AND order_id = ${order}` : sql``}
    ORDER BY created_at DESC
    LIMIT 100
  ` as unknown as any[];
}

export async function markCustomerDeliveryNotificationRead(input: { id: string; customerId: string }) {
  await ensureDeliveryNotificationSchema();
  const rows = await sql()`
    UPDATE delivery_notification_outbox
    SET read_at = COALESCE(read_at, NOW()), updated_at = NOW()
    WHERE id = ${clean(input.id, 120)}
      AND customer_id = ${input.customerId}
      AND channel = 'in_app'
    RETURNING id, read_at
  ` as unknown as any[];
  return rows[0] || null;
}

export async function listPendingExternalDeliveryNotifications(limit = 100) {
  await ensureDeliveryNotificationSchema();
  return await sql()`
    SELECT *
    FROM delivery_notification_outbox
    WHERE channel <> 'in_app' AND delivery_status IN ('pending','retry')
    ORDER BY created_at ASC
    LIMIT ${Math.max(1, Math.min(250, Math.trunc(limit)))}
  ` as unknown as any[];
}
