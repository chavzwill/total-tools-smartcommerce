import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import { markDeliveryNotificationPhoneVerified } from "../src/server/deliveryNotificationPreferences.js";
import { enforceDurableRateLimit } from "../src/server/securityInfrastructure.js";

const COOKIE_NAME="sc_session";let sqlClient:ReturnType<typeof neon>|undefined;
function sql(){if(!sqlClient){const url=process.env.SMARTCOMMERCE_DATABASE_URL||process.env.DATABASE_URL;if(!url)throw new Error("COMMERCE_DATABASE_NOT_CONFIGURED");sqlClient=neon(url);}return sqlClient;}
function firstHeader(value:string|string[]|undefined){return Array.isArray(value)?value[0]:value;}
function parseCookie(header?:string){const out:Record<string,string>={};for(const part of(header||"").split(";")){const i=part.indexOf("=");if(i<=0)continue;try{out[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1).trim());}catch{out[part.slice(0,i).trim()]=part.slice(i+1).trim();}}return out;}
function hashToken(token:string){return createHash("sha256").update(token).digest("hex");}
function base64(value:string){return Buffer.from(value,"utf8").toString("base64");}
function normalizePhone(value:string){const raw=String(value||"").replace(/[^\d+]/g,"");if(raw.startsWith("+"))return raw;if(raw.startsWith("1"))return `+${raw}`;if(raw.length===10)return `+1${raw}`;return raw?`+${raw}`:"";}
async function currentCustomer(request:any){const token=parseCookie(firstHeader(request.headers?.cookie))[COOKIE_NAME];if(!token)return null;const rows=await sql()`SELECT c.id,c.phone FROM customer_sessions s JOIN customer_accounts c ON c.id=s.customer_id WHERE s.token_hash=${hashToken(token)} AND s.revoked_at IS NULL AND s.expires_at>NOW() LIMIT 1` as unknown as Array<{id:string;phone:string|null}>;return rows[0]||null;}
async function readBody(request:AsyncIterable<unknown>){const chunks:Buffer[]=[];let total=0;for await(const chunk of request){if(chunk==null)continue;const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(String(chunk));total+=buffer.length;if(total>6000)throw Object.assign(new Error("BODY_TOO_LARGE"),{status:413});chunks.push(buffer);}return JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}");}
function sameOrigin(request:any){const origin=firstHeader(request.headers?.origin);if(!origin)return true;const host=firstHeader(request.headers?.host);if(!host)return false;try{return new URL(origin).host===host;}catch{return false;}}
function send(response:any,status:number,payload:unknown){response.statusCode=status;response.setHeader("Content-Type","application/json");response.setHeader("Cache-Control","no-store");response.setHeader("X-Content-Type-Options","nosniff");response.end(JSON.stringify(payload));}
function config(){const sid=String(process.env.TWILIO_ACCOUNT_SID||"").trim();const token=String(process.env.TWILIO_AUTH_TOKEN||"").trim();const service=String(process.env.SMARTCOMMERCE_TWILIO_VERIFY_SERVICE_SID||"").trim();if(!sid||!token||!service)throw new Error("PHONE_VERIFICATION_NOT_CONFIGURED");return {sid,token,service};}

export default async function handler(request:any,response:any){
  if(String(request.method||"POST").toUpperCase()!=="POST"){response.setHeader("Allow","POST");return send(response,405,{error:{code:"METHOD_NOT_ALLOWED",message:"POST is required."}});}
  if(!sameOrigin(request))return send(response,403,{error:{code:"ORIGIN_REJECTED",message:"This request was rejected."}});
  try{
    const customer=await currentCustomer(request);if(!customer)return send(response,401,{error:{code:"AUTH_REQUIRED",message:"Sign in to verify your phone."}});const phone=normalizePhone(customer.phone||"");if(!phone)return send(response,409,{error:{code:"CUSTOMER_PHONE_REQUIRED",message:"Add a phone number to your account before enabling SMS or WhatsApp."}});
    const input=await readBody(request);const action=String(input.action||"");const {sid,token,service}=config();const auth=`Basic ${base64(`${sid}:${token}`)}`;
    if(action==="start"){
      await enforceDurableRateLimit({request,action:"delivery_phone_verify_start",subject:customer.id,limit:5,windowSeconds:3600});
      const form=new URLSearchParams({To:phone,Channel:"sms"});const r=await fetch(`https://verify.twilio.com/v2/Services/${encodeURIComponent(service)}/Verifications`,{method:"POST",headers:{Authorization:auth,"Content-Type":"application/x-www-form-urlencoded"},body:form.toString()});const payload=await r.json().catch(()=>({})) as any;if(!r.ok)return send(response,r.status>=500?503:400,{error:{code:"PHONE_VERIFICATION_START_FAILED",message:"We could not send a verification code right now."}});return send(response,200,{status:String(payload?.status||"pending")});
    }
    if(action==="check"){
      await enforceDurableRateLimit({request,action:"delivery_phone_verify_check",subject:customer.id,limit:12,windowSeconds:1800});const code=String(input.code||"").trim();if(!/^\d{4,10}$/.test(code))return send(response,400,{error:{code:"INVALID_VERIFICATION_CODE",message:"Enter the verification code sent to your phone."}});
      const form=new URLSearchParams({To:phone,Code:code});const r=await fetch(`https://verify.twilio.com/v2/Services/${encodeURIComponent(service)}/VerificationCheck`,{method:"POST",headers:{Authorization:auth,"Content-Type":"application/x-www-form-urlencoded"},body:form.toString()});const payload=await r.json().catch(()=>({})) as any;if(!r.ok||String(payload?.status||"")!=="approved")return send(response,400,{error:{code:"PHONE_VERIFICATION_FAILED",message:"That verification code was not accepted."}});const preferences=await markDeliveryNotificationPhoneVerified(customer.id,phone);return send(response,200,{verified:true,preferences});
    }
    return send(response,400,{error:{code:"INVALID_ACTION",message:"Use start or check."}});
  }catch(error:any){if(error instanceof SyntaxError)return send(response,400,{error:{code:"INVALID_JSON",message:"The request body is invalid."}});if(error?.message==="PHONE_VERIFICATION_NOT_CONFIGURED")return send(response,503,{error:{code:"PHONE_VERIFICATION_NOT_CONFIGURED",message:"Phone verification is not configured yet."}});if(error?.message==="RATE_LIMITED")return send(response,429,{error:{code:"RATE_LIMITED",message:"Too many verification attempts. Please wait and try again."}});if(Number(error?.status)===413)return send(response,413,{error:{code:"REQUEST_TOO_LARGE",message:"The request is too large."}});console.error("delivery_phone_verification_error",{code:error instanceof Error?error.message:"unknown"});return send(response,503,{error:{code:"PHONE_VERIFICATION_UNAVAILABLE",message:"Phone verification is temporarily unavailable."}});}
}
