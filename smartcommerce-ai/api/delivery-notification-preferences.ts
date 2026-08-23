import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import { getDeliveryNotificationPreferences, updateDeliveryNotificationPreferences } from "../src/server/deliveryNotificationPreferences.js";
import { enforceDurableRateLimit } from "../src/server/securityInfrastructure.js";

const COOKIE_NAME="sc_session";let sqlClient:ReturnType<typeof neon>|undefined;
function sql(){if(!sqlClient){const url=process.env.SMARTCOMMERCE_DATABASE_URL||process.env.DATABASE_URL;if(!url)throw new Error("COMMERCE_DATABASE_NOT_CONFIGURED");sqlClient=neon(url);}return sqlClient;}
function firstHeader(value:string|string[]|undefined){return Array.isArray(value)?value[0]:value;}
function parseCookie(header?:string){const out:Record<string,string>={};for(const part of(header||"").split(";")){const i=part.indexOf("=");if(i<=0)continue;try{out[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1).trim());}catch{out[part.slice(0,i).trim()]=part.slice(i+1).trim();}}return out;}
function hashToken(token:string){return createHash("sha256").update(token).digest("hex");}
async function currentCustomerId(request:any){const token=parseCookie(firstHeader(request.headers?.cookie))[COOKIE_NAME];if(!token)return undefined;const rows=await sql()`SELECT customer_id FROM customer_sessions WHERE token_hash=${hashToken(token)} AND revoked_at IS NULL AND expires_at>NOW() LIMIT 1` as unknown as Array<{customer_id:string}>;return rows[0]?.customer_id;}
function sameOrigin(request:any){const origin=firstHeader(request.headers?.origin);if(!origin)return true;const host=firstHeader(request.headers?.host);if(!host)return false;try{return new URL(origin).host===host;}catch{return false;}}
async function readBody(request:AsyncIterable<unknown>){const chunks:Buffer[]=[];let total=0;for await(const chunk of request){if(chunk==null)continue;const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(String(chunk));total+=buffer.length;if(total>8000)throw Object.assign(new Error("BODY_TOO_LARGE"),{status:413});chunks.push(buffer);}return JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}");}
function send(response:any,status:number,payload:unknown){response.statusCode=status;response.setHeader("Content-Type","application/json");response.setHeader("Cache-Control","no-store");response.setHeader("X-Content-Type-Options","nosniff");response.end(JSON.stringify(payload));}

export default async function handler(request:any,response:any){
  const method=String(request.method||"GET").toUpperCase();if(!["GET","PATCH"].includes(method)){response.setHeader("Allow","GET, PATCH");return send(response,405,{error:{code:"METHOD_NOT_ALLOWED",message:"GET or PATCH is required."}});}
  if(!sameOrigin(request))return send(response,403,{error:{code:"ORIGIN_REJECTED",message:"This request was rejected."}});
  try{
    const customerId=await currentCustomerId(request);if(!customerId)return send(response,401,{error:{code:"AUTH_REQUIRED",message:"Sign in to manage delivery notifications."}});
    await enforceDurableRateLimit({request,action:"delivery_notification_preferences",subject:customerId,limit:120,windowSeconds:600});
    if(method==="GET")return send(response,200,{preferences:await getDeliveryNotificationPreferences(customerId)});
    const input=await readBody(request);
    const preferences=await updateDeliveryNotificationPreferences({customerId,emailEnabled:Boolean(input.emailEnabled),smsEnabled:Boolean(input.smsEnabled),whatsappEnabled:Boolean(input.whatsappEnabled)});
    return send(response,200,{preferences});
  }catch(error:any){
    if(error instanceof SyntaxError)return send(response,400,{error:{code:"INVALID_JSON",message:"The request body is invalid."}});
    if(error?.message==="VERIFIED_PHONE_REQUIRED")return send(response,409,{error:{code:"VERIFIED_PHONE_REQUIRED",message:"Verify your phone number before enabling SMS or WhatsApp delivery updates."}});
    if(error?.message==="RATE_LIMITED")return send(response,429,{error:{code:"RATE_LIMITED",message:"Too many preference changes. Please wait and try again."}});
    if(Number(error?.status)===413)return send(response,413,{error:{code:"REQUEST_TOO_LARGE",message:"The request is too large."}});
    console.error("delivery_notification_preferences_error",{code:error instanceof Error?error.message:"unknown"});
    return send(response,503,{error:{code:"DELIVERY_NOTIFICATION_PREFERENCES_UNAVAILABLE",message:"Notification preferences are temporarily unavailable."}});
  }
}
