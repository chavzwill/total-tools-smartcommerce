import { neon } from "@neondatabase/serverless";

let sqlClient: ReturnType<typeof neon> | undefined;
let schemaReady = false;
function sql(){if(!sqlClient){const url=process.env.SMARTCOMMERCE_DATABASE_URL||process.env.DATABASE_URL;if(!url)throw new Error("DELIVERY_NOTIFICATION_DATABASE_NOT_CONFIGURED");sqlClient=neon(url);}return sqlClient;}

export type DeliveryNotificationPreferences={customerId:string;emailEnabled:boolean;smsEnabled:boolean;whatsappEnabled:boolean;phoneVerifiedAt:string|null;updatedAt:string};

export async function ensureDeliveryNotificationPreferencesSchema(){
  if(schemaReady)return;
  await sql()`CREATE TABLE IF NOT EXISTS delivery_notification_preferences (
    customer_id TEXT PRIMARY KEY,
    email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sms_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    phone_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  schemaReady=true;
}

function map(row:any):DeliveryNotificationPreferences{return {customerId:row.customer_id,emailEnabled:Boolean(row.email_enabled),smsEnabled:Boolean(row.sms_enabled),whatsappEnabled:Boolean(row.whatsapp_enabled),phoneVerifiedAt:row.phone_verified_at?new Date(row.phone_verified_at).toISOString():null,updatedAt:new Date(row.updated_at).toISOString()};}

export async function getDeliveryNotificationPreferences(customerId:string){
  await ensureDeliveryNotificationPreferencesSchema();
  await sql()`INSERT INTO delivery_notification_preferences (customer_id) VALUES (${customerId}) ON CONFLICT (customer_id) DO NOTHING`;
  const rows=await sql()`SELECT * FROM delivery_notification_preferences WHERE customer_id=${customerId} LIMIT 1` as unknown as any[];
  return map(rows[0]);
}

export async function updateDeliveryNotificationPreferences(input:{customerId:string;emailEnabled:boolean;smsEnabled:boolean;whatsappEnabled:boolean}){
  await ensureDeliveryNotificationPreferencesSchema();
  const current=await getDeliveryNotificationPreferences(input.customerId);
  if((input.smsEnabled||input.whatsappEnabled)&&!current.phoneVerifiedAt)throw new Error("VERIFIED_PHONE_REQUIRED");
  const rows=await sql()`UPDATE delivery_notification_preferences SET email_enabled=${Boolean(input.emailEnabled)},sms_enabled=${Boolean(input.smsEnabled)},whatsapp_enabled=${Boolean(input.whatsappEnabled)},updated_at=NOW() WHERE customer_id=${input.customerId} RETURNING *` as unknown as any[];
  return map(rows[0]);
}

export async function notificationChannelAllowed(customerId:string,channel:"email"|"sms"|"whatsapp"){
  const prefs=await getDeliveryNotificationPreferences(customerId);
  if(channel==="email")return prefs.emailEnabled;
  if(channel==="sms")return prefs.smsEnabled&&Boolean(prefs.phoneVerifiedAt);
  return prefs.whatsappEnabled&&Boolean(prefs.phoneVerifiedAt);
}
