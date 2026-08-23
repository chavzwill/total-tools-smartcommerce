import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import { getDeliveryLifecycleForCustomer } from "../src/server/deliveryLifecycleStore.js";
import { enforceDurableRateLimit, requestIp } from "../src/server/securityInfrastructure.js";

const COOKIE_NAME = "sc_session";
let sqlClient: ReturnType<typeof neon> | undefined;
function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("COMMERCE_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}
function firstHeader(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function parseCookie(header?: string) {
  const out: Record<string,string> = {};
  for (const part of (header || "").split(";")) {
    const i = part.indexOf("="); if (i <= 0) continue;
    try { out[part.slice(0,i).trim()] = decodeURIComponent(part.slice(i+1).trim()); } catch { out[part.slice(0,i).trim()] = part.slice(i+1).trim(); }
  }
  return out;
}
function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
async function currentCustomerId(request: any) {
  const token = parseCookie(firstHeader(request.headers?.cookie))[COOKIE_NAME];
  if (!token) return undefined;
  const rows = await sql()`SELECT customer_id FROM customer_sessions WHERE token_hash=${hashToken(token)} AND revoked_at IS NULL AND expires_at>NOW() LIMIT 1` as Array<{customer_id:string}>;
  return rows[0]?.customer_id;
}
function send(response:any,status:number,payload:unknown){response.statusCode=status;response.setHeader("Content-Type","application/json");response.setHeader("Cache-Control","no-store");response.setHeader("X-Content-Type-Options","nosniff");response.end(JSON.stringify(payload));}

export default async function handler(request:any,response:any){
  if(String(request.method||"GET").toUpperCase()!=="GET"){response.setHeader("Allow","GET");return send(response,405,{error:{code:"METHOD_NOT_ALLOWED",message:"GET is required."}});}
  try{
    const customerId=await currentCustomerId(request);
    if(!customerId)return send(response,401,{error:{code:"AUTH_REQUIRED",message:"Sign in to track this order."}});
    await enforceDurableRateLimit({request,action:"customer_delivery_tracking",subject:customerId||requestIp(request),limit:120,windowSeconds:600});
    const orderId=String(request.query?.orderId||"").trim().slice(0,180);
    if(!orderId)return send(response,400,{error:{code:"ORDER_REFERENCE_REQUIRED",message:"An order reference is required."}});
    const result=await getDeliveryLifecycleForCustomer(orderId,customerId);
    if(!result)return send(response,404,{error:{code:"ORDER_TRACKING_NOT_FOUND",message:"Tracking is not available for that order."}});
    const row=result.lifecycle;
    return send(response,200,{tracking:{
      orderId:row.order_id,status:row.status,fulfilmentMode:row.fulfilment_mode,provider:row.provider||null,serviceLabel:row.service_label||null,
      collectionPointName:row.collection_point_name||null,scheduledFor:row.scheduled_for||null,trackingReference:row.tracking_reference||null,
      exceptionMessage:row.exception_message||null,completedAt:row.completed_at||null,proofRecipientName:row.proof_recipient_name||null,proofReference:row.proof_reference||null,
      events:result.events.map((event:any)=>({status:event.status,message:event.public_message||null,at:event.created_at}))
    }});
  }catch(error:any){
    if(error?.message==="RATE_LIMITED")return send(response,429,{error:{code:"RATE_LIMITED",message:"Too many tracking requests. Please wait and try again."}});
    console.error("customer_delivery_tracking_error",{code:error instanceof Error?error.message:"unknown"});
    return send(response,503,{error:{code:"ORDER_TRACKING_UNAVAILABLE",message:"Order tracking is temporarily unavailable."}});
  }
}
