import { createHmac, timingSafeEqual } from "node:crypto";
import { reconcileExternalNotification } from "../src/server/deliveryNotificationOutbox.js";

const MAX_BODY_BYTES=32_000;
function firstHeader(value:string|string[]|undefined){return Array.isArray(value)?value[0]:value;}
function send(response:any,status:number,payload:unknown){response.statusCode=status;response.setHeader("Content-Type","application/json");response.setHeader("Cache-Control","no-store");response.end(JSON.stringify(payload));}
async function readRaw(request:AsyncIterable<unknown>){const chunks:Buffer[]=[];let total=0;for await(const chunk of request){if(chunk==null)continue;const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(String(chunk));total+=buffer.length;if(total>MAX_BODY_BYTES)throw Object.assign(new Error("BODY_TOO_LARGE"),{status:413});chunks.push(buffer);}return Buffer.concat(chunks).toString("utf8");}
function safeEqual(a:string,b:string){const left=Buffer.from(a);const right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right);}
function expectedSignature(url:string,params:URLSearchParams,token:string){let value=url;const keys=Array.from(new Set(Array.from(params.keys()))).sort();for(const key of keys){for(const item of params.getAll(key).sort())value+=key+item;}return createHmac("sha1",token).update(value).digest("base64");}

export default async function handler(request:any,response:any){
  if(String(request.method||"POST").toUpperCase()!=="POST"){response.setHeader("Allow","POST");return send(response,405,{error:{code:"METHOD_NOT_ALLOWED",message:"POST is required."}});}
  try{
    const token=String(process.env.TWILIO_AUTH_TOKEN||"").trim();const callbackUrl=String(process.env.SMARTCOMMERCE_TWILIO_STATUS_CALLBACK_URL||"").trim();
    if(!token||!callbackUrl)return send(response,503,{error:{code:"TWILIO_CALLBACK_NOT_CONFIGURED",message:"Twilio delivery reconciliation is not configured."}});
    const raw=await readRaw(request);const params=new URLSearchParams(raw);const supplied=firstHeader(request.headers?.["x-twilio-signature"])||"";
    if(!supplied||!safeEqual(supplied,expectedSignature(callbackUrl,params,token)))return send(response,403,{error:{code:"TWILIO_SIGNATURE_INVALID",message:"The callback signature is invalid."}});
    const sid=String(params.get("MessageSid")||"").trim();const status=String(params.get("MessageStatus")||"").trim().toLowerCase();const errorCode=String(params.get("ErrorCode")||"").trim()||null;
    if(!sid||!status)return send(response,400,{error:{code:"TWILIO_STATUS_INVALID",message:"The delivery callback is incomplete."}});
    const reconciled=await reconcileExternalNotification({providerMessageId:sid,deliveryStatus:status,errorCode});
    return send(response,200,{ok:true,reconciled:Boolean(reconciled)});
  }catch(error:any){
    if(Number(error?.status)===413)return send(response,413,{error:{code:"REQUEST_TOO_LARGE",message:"The callback is too large."}});
    console.error("twilio_delivery_status_error",{code:error instanceof Error?error.message:"unknown"});
    return send(response,503,{error:{code:"TWILIO_STATUS_UNAVAILABLE",message:"The delivery callback could not be processed."}});
  }
}
