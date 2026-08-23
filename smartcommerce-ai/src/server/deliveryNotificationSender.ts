import { neon } from "@neondatabase/serverless";
import {
  claimPendingExternalDeliveryNotifications,
  markExternalNotificationAccepted,
  markExternalNotificationRetry,
  markExternalNotificationUncertain,
  type DeliveryNotificationOutboxRow,
} from "./deliveryNotificationOutbox.js";
import { notificationChannelAllowed } from "./deliveryNotificationPreferences.js";

let sqlClient: ReturnType<typeof neon> | undefined;
function sql(){if(!sqlClient){const url=process.env.SMARTCOMMERCE_DATABASE_URL||process.env.DATABASE_URL;if(!url)throw new Error("DELIVERY_NOTIFICATION_DATABASE_NOT_CONFIGURED");sqlClient=neon(url);}return sqlClient;}
function clean(value:unknown,max=500){return String(value||"").trim().slice(0,max);}
function base64(value:string){return Buffer.from(value,"utf8").toString("base64");}
function normalizePhone(value:string){const raw=value.replace(/[^\d+]/g,"");if(raw.startsWith("+"))return raw;if(raw.startsWith("1"))return `+${raw}`;if(raw.length===10)return `+1${raw}`;return raw?`+${raw}`:"";}
async function customerContact(customerId:string){const rows=await sql()`SELECT email,phone,email_verified FROM customer_accounts WHERE id=${customerId} LIMIT 1` as unknown as Array<{email:string;phone:string|null;email_verified:boolean}>;return rows[0]||null;}

async function sendResend(row:DeliveryNotificationOutboxRow,email:string){
  const apiKey=clean(process.env.RESEND_API_KEY,300);const from=clean(process.env.SMARTCOMMERCE_NOTIFICATION_EMAIL_FROM,250);
  if(!apiKey||!from)throw Object.assign(new Error("EMAIL_PROVIDER_NOT_CONFIGURED"),{retryable:false});
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json","Idempotency-Key":`delivery/${row.id}`},body:JSON.stringify({from,to:[email],subject:row.subject||`Order ${row.order_id} update`,text:`${row.message}\n\nOrder reference: ${row.order_id}`})});
  const payload=await response.json().catch(()=>({})) as any;
  if(!response.ok)throw Object.assign(new Error(clean(payload?.message||payload?.name||`HTTP_${response.status}`,120)),{retryable:response.status===429||response.status>=500,httpStatus:response.status});
  const id=clean(payload?.id,180);if(!id)throw Object.assign(new Error("EMAIL_PROVIDER_ID_MISSING"),{retryable:false});
  return {providerMessageId:id,status:"accepted"};
}

async function sendTwilio(row:DeliveryNotificationOutboxRow,phone:string){
  const sid=clean(process.env.TWILIO_ACCOUNT_SID,120);const token=clean(process.env.TWILIO_AUTH_TOKEN,250);
  if(!sid||!token)throw Object.assign(new Error("TWILIO_NOT_CONFIGURED"),{retryable:false});
  const normalized=normalizePhone(phone);if(!normalized)throw Object.assign(new Error("CUSTOMER_PHONE_MISSING"),{retryable:false});
  const form=new URLSearchParams();const statusCallback=clean(process.env.SMARTCOMMERCE_TWILIO_STATUS_CALLBACK_URL,500);if(statusCallback)form.set("StatusCallback",statusCallback);
  if(row.channel==="whatsapp"){
    const from=clean(process.env.SMARTCOMMERCE_TWILIO_WHATSAPP_FROM,80);const contentSid=clean(process.env.SMARTCOMMERCE_TWILIO_WHATSAPP_CONTENT_SID,100);
    if(!from||!contentSid)throw Object.assign(new Error("WHATSAPP_PROVIDER_NOT_CONFIGURED"),{retryable:false});
    form.set("From",from.startsWith("whatsapp:")?from:`whatsapp:${from}`);form.set("To",`whatsapp:${normalized}`);form.set("ContentSid",contentSid);form.set("ContentVariables",JSON.stringify({"1":row.order_id,"2":row.message}));
  }else{
    const from=clean(process.env.SMARTCOMMERCE_TWILIO_SMS_FROM,80);const messagingServiceSid=clean(process.env.SMARTCOMMERCE_TWILIO_MESSAGING_SERVICE_SID,100);
    if(messagingServiceSid)form.set("MessagingServiceSid",messagingServiceSid);else if(from)form.set("From",from);else throw Object.assign(new Error("SMS_PROVIDER_NOT_CONFIGURED"),{retryable:false});
    form.set("To",normalized);form.set("Body",`${row.message} Order: ${row.order_id}`.slice(0,1500));
  }
  const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,{method:"POST",headers:{Authorization:`Basic ${base64(`${sid}:${token}`)}`,"Content-Type":"application/x-www-form-urlencoded"},body:form.toString()});
  const payload=await response.json().catch(()=>({})) as any;
  if(!response.ok)throw Object.assign(new Error(clean(payload?.code||payload?.message||`HTTP_${response.status}`,120)),{retryable:response.status===429||response.status>=500,httpStatus:response.status});
  const id=clean(payload?.sid,180);if(!id)throw Object.assign(new Error("TWILIO_PROVIDER_ID_MISSING"),{retryable:false});
  return {providerMessageId:id,status:clean(payload?.status,40)||"accepted"};
}

async function sendOne(row:DeliveryNotificationOutboxRow){
  const contact=await customerContact(row.customer_id);if(!contact)throw Object.assign(new Error("CUSTOMER_CONTACT_NOT_FOUND"),{retryable:false});
  if(row.channel==="email"){
    if(!(await notificationChannelAllowed(row.customer_id,"email")))throw Object.assign(new Error("CUSTOMER_EMAIL_NOTIFICATIONS_DISABLED"),{retryable:false});
    if(!contact.email||!contact.email_verified)throw Object.assign(new Error("VERIFIED_CUSTOMER_EMAIL_REQUIRED"),{retryable:false});
    return sendResend(row,contact.email);
  }
  if(row.channel==="sms"||row.channel==="whatsapp"){
    if(!(await notificationChannelAllowed(row.customer_id,row.channel,contact.phone)))throw Object.assign(new Error(row.channel==="sms"?"CUSTOMER_SMS_NOTIFICATIONS_DISABLED_OR_PHONE_UNVERIFIED":"CUSTOMER_WHATSAPP_NOTIFICATIONS_DISABLED_OR_PHONE_UNVERIFIED"),{retryable:false});
    return sendTwilio(row,contact.phone||"");
  }
  throw Object.assign(new Error("UNSUPPORTED_NOTIFICATION_CHANNEL"),{retryable:false});
}

export async function processPendingDeliveryNotifications(limit=20){
  const rows=await claimPendingExternalDeliveryNotifications(limit);const summary={claimed:rows.length,accepted:0,retry:0,uncertain:0};
  for(const row of rows){
    try{const result=await sendOne(row);await markExternalNotificationAccepted({id:row.id,providerMessageId:result.providerMessageId,providerStatus:result.status});summary.accepted++;}
    catch(error:any){const code=clean(error instanceof Error?error.message:"NOTIFICATION_SEND_FAILED",120)||"NOTIFICATION_SEND_FAILED";if(error?.retryable===true){const delay=Math.min(21600,Math.max(60,Math.pow(2,Math.min(8,row.attempt_count))*60));await markExternalNotificationRetry({id:row.id,errorCode:code,delaySeconds:delay});summary.retry++;}else{await markExternalNotificationUncertain({id:row.id,errorCode:code});summary.uncertain++;}}
  }
  return summary;
}
