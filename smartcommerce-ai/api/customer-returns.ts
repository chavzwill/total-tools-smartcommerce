import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { createReturnRequest, getCustomerReturn, listCustomerReturns } from "../src/server/returnRequestStore.js";
import { enforceDurableRateLimit, firstHeader, requestIp } from "../src/server/securityInfrastructure.js";

const COOKIE_NAME="sc_session";
const MAX_BODY_BYTES=20_000;
let sqlClient:ReturnType<typeof neon>|undefined;
function sql(){if(!sqlClient){const url=process.env.SMARTCOMMERCE_DATABASE_URL||process.env.DATABASE_URL;if(!url)throw new Error("COMMERCE_DATABASE_NOT_CONFIGURED");sqlClient=neon(url);}return sqlClient;}
function parseCookie(header?:string){const out:Record<string,string>={};for(const part of(header||"").split(";")){const i=part.indexOf("=");if(i<=0)continue;try{out[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1).trim());}catch{out[part.slice(0,i).trim()]=part.slice(i+1).trim();}}return out;}
function hashToken(token:string){return createHash("sha256").update(token).digest("hex");}
async function currentCustomerId(request:any){const token=parseCookie(firstHeader(request.headers?.cookie))[COOKIE_NAME];if(!token)return undefined;const rows=await sql()`SELECT customer_id FROM customer_sessions WHERE token_hash=${hashToken(token)} AND revoked_at IS NULL AND expires_at>NOW() LIMIT 1` as Array<{customer_id:string}>;return rows[0]?.customer_id;}
function sameOrigin(request:any){const origin=firstHeader(request.headers?.origin);if(!origin)return true;const host=firstHeader(request.headers?.host);if(!host)return false;try{return new URL(origin).host===host;}catch{return false;}}
async function readJsonBody<T>(request:AsyncIterable<unknown>):Promise<T>{const chunks:Buffer[]=[];let total=0;for await(const chunk of request){if(chunk==null)continue;const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(String(chunk));total+=buffer.length;if(total>MAX_BODY_BYTES)throw Object.assign(new Error("REQUEST_TOO_LARGE"),{status:413});chunks.push(buffer);}return JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}") as T;}
function send(response:any,status:number,payload:unknown){response.statusCode=status;response.setHeader("Content-Type","application/json");response.setHeader("Cache-Control","no-store");response.setHeader("X-Content-Type-Options","nosniff");response.setHeader("Referrer-Policy","same-origin");response.end(JSON.stringify(payload));}

export default async function handler(request:any,response:any){
 const method=String(request.method||"GET").toUpperCase();
 if(!sameOrigin(request))return send(response,403,{error:{code:"ORIGIN_REJECTED",message:"This request was rejected."}});
 try{
  const customerId=await currentCustomerId(request);
  if(!customerId)return send(response,401,{error:{code:"AUTH_REQUIRED",message:"Sign in to manage returns."}});
  await enforceDurableRateLimit({request,action:"customer_returns",subject:customerId||requestIp(request),limit:60,windowSeconds:600});
  if(method==="GET"){
   const returnId=String(request.query?.id||"").trim().slice(0,180);
   if(returnId){const result=await getCustomerReturn(returnId,customerId);if(!result)return send(response,404,{error:{code:"RETURN_NOT_FOUND",message:"That return request was not found."}});return send(response,200,result);}
   return send(response,200,{returns:await listCustomerReturns(customerId)});
  }
  if(method!=="POST"){response.setHeader("Allow","GET, POST");return send(response,405,{error:{code:"METHOD_NOT_ALLOWED",message:"GET or POST is required."}});}
  const input=await readJsonBody<{orderId?:string;requestedResolution?:string;reason?:string;itemSummary?:string;customerNotes?:string;requestedAmountMinor?:number}>(request);
  const created=await createReturnRequest({customerId,orderId:String(input.orderId||""),requestedResolution:String(input.requestedResolution||""),reason:String(input.reason||""),itemSummary:input.itemSummary,customerNotes:input.customerNotes,requestedAmountMinor:input.requestedAmountMinor});
  return send(response,201,{return:created});
 }catch(error:any){
  if(error instanceof SyntaxError)return send(response,400,{error:{code:"INVALID_JSON",message:"The request body is invalid."}});
  if(Number(error?.status)===413)return send(response,413,{error:{code:"REQUEST_TOO_LARGE",message:"The request is too large."}});
  if(error?.message==="RATE_LIMITED")return send(response,429,{error:{code:"RATE_LIMITED",message:"Too many return requests. Please wait and try again."}});
  if(error?.message==="RETURN_ORDER_REQUIRED")return send(response,400,{error:{code:"RETURN_ORDER_REQUIRED",message:"Enter a valid order reference."}});
  if(error?.message==="RETURN_RESOLUTION_INVALID")return send(response,400,{error:{code:"RETURN_RESOLUTION_INVALID",message:"Choose a supported return resolution."}});
  if(error?.message==="RETURN_REASON_INVALID")return send(response,400,{error:{code:"RETURN_REASON_INVALID",message:"Choose a supported return reason."}});
  if(error?.message==="RETURN_ORDER_NOT_OWNED")return send(response,404,{error:{code:"RETURN_ORDER_NOT_OWNED",message:"We could not verify that order on this account."}});
  console.error("customer_returns_api_error",{code:error instanceof Error?error.message:"unknown"});
  return send(response,503,{error:{code:"RETURNS_UNAVAILABLE",message:"Returns are temporarily unavailable.",retryable:true}});
 }
}
