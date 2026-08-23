import { createHmac, timingSafeEqual } from "node:crypto";
import { reconcileExternalNotification } from "../src/server/deliveryNotificationOutbox.js";

const MAX_BODY_BYTES=64_000;
function firstHeader(value:string|string[]|undefined){return Array.isArray(value)?value[0]:value;}
function send(response:any,status:number,payload:unknown){response.statusCode=status;response.setHeader("Content-Type","application/json");response.setHeader("Cache-Control","no-store");response.end(JSON.stringify(payload));}
async function readRaw(request:AsyncIterable<unknown>){const chunks:Buffer[]=[];let total=0;for await(const chunk of request){if(chunk==null)continue;const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(String(chunk));total+=buffer.length;if(total>MAX_BODY_BYTES)throw Object.assign(new Error("BODY_TOO_LARGE"),{status:413});chunks.push(buffer);}return Buffer.concat(chunks).toString("utf8");}
function safeEqual(a:string,b:string){const left=Buffer.from(a);const right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right);}
function verify(raw:string,id:string,timestamp:string,signatureHeader:string,secret:string){
  const age=Math.abs(Date.now()/1000-Number(timestamp));if(!Number.isFinite(age)||age>300)return false;
  const encoded=secret.startsWith("whsec_")?secret.slice(6):secret;let key:Buffer;try{key=Buffer.from(encoded,"base64");}catch{return false;}
  const expected=createHmac("sha256",key).update(`${id}.${timestamp}.${raw}`).digest("base64");
  return signatureHeader.split(" ").some(part=>{const [version,value]=part.split(",");return version==="v1"&&Boolean(value)&&safeEqual(value,expected);});
}
function normalizeEvent(type:string){
  const value=type.toLowerCase();if(value==="email.delivered")return "delivered";if(value==="email.sent")return "sent";if(value==="email.bounced")return "bounced";if(value==="email.complained")return "complained";if(value==="email.delivery_delayed")return "delayed";return "unknown";
}

export default async function handler(request:any,response:any){
  if(String(request.method||"POST").toUpperCase()!=="POST"){response.setHeader("Allow","POST");return send(response,405,{error:{code:"METHOD_NOT_ALLOWED",message:"POST is required."}});}
  try{
    const secret=String(process.env.RESEND_WEBHOOK_SECRET||"").trim();if(!secret)return send(response,503,{error:{code:"RESEND_CALLBACK_NOT_CONFIGURED",message:"Resend delivery reconciliation is not configured."}});
    const raw=await readRaw(request);const id=firstHeader(request.headers?.["svix-id"])||"";const timestamp=firstHeader(request.headers?.["svix-timestamp"])||"";const signature=firstHeader(request.headers?.["svix-signature"])||"";
    if(!id||!timestamp||!signature||!verify(raw,id,timestamp,signature,secret))return send(response,403,{error:{code:"RESEND_SIGNATURE_INVALID",message:"The callback signature is invalid."}});
    const event=JSON.parse(raw||"{}") as any;const providerMessageId=String(event?.data?.email_id||event?.data?.id||"").trim();const status=normalizeEvent(String(event?.type||""));
    if(!providerMessageId||status==="unknown")return send(response,200,{ok:true,reconciled:false});
    const reconciled=await reconcileExternalNotification({providerMessageId,deliveryStatus:status,errorCode:event?.data?.bounce?.message||null});
    return send(response,200,{ok:true,reconciled:Boolean(reconciled)});
  }catch(error:any){
    if(error instanceof SyntaxError)return send(response,400,{error:{code:"INVALID_JSON",message:"The callback body is invalid."}});
    if(Number(error?.status)===413)return send(response,413,{error:{code:"REQUEST_TOO_LARGE",message:"The callback is too large."}});
    console.error("resend_delivery_status_error",{code:error instanceof Error?error.message:"unknown"});
    return send(response,503,{error:{code:"RESEND_STATUS_UNAVAILABLE",message:"The delivery callback could not be processed."}});
  }
}
