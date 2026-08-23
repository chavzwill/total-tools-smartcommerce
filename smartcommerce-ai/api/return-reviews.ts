import { canStaff, parseCookie, readStaffSession, STAFF_COOKIE_NAME } from "../src/server/staffSession.js";
import { firstHeader, recordSecurityEvent } from "../src/server/securityInfrastructure.js";
import { listStaffReturns, reviewReturnRequest } from "../src/server/returnRequestStore.js";

const MAX_BODY_BYTES=20_000;
function sameOrigin(request:any){const origin=firstHeader(request.headers?.origin);if(!origin)return true;const host=firstHeader(request.headers?.host);if(!host)return false;try{return new URL(origin).host===host;}catch{return false;}}
function staffFromRequest(request:any){const token=parseCookie(firstHeader(request.headers?.cookie))[STAFF_COOKIE_NAME];return readStaffSession(token);}
function canReview(staff:ReturnType<typeof staffFromRequest>){return canStaff(staff,"purchasing_approve")||canStaff(staff,"security_manage")||canStaff(staff,"delivery_review");}
async function readJsonBody<T>(request:AsyncIterable<unknown>):Promise<T>{const chunks:Buffer[]=[];let total=0;for await(const chunk of request){if(chunk==null)continue;const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(String(chunk));total+=buffer.length;if(total>MAX_BODY_BYTES)throw Object.assign(new Error("REQUEST_TOO_LARGE"),{status:413});chunks.push(buffer);}return JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}") as T;}
function send(response:any,status:number,payload:unknown){response.statusCode=status;response.setHeader("Content-Type","application/json");response.setHeader("Cache-Control","no-store");response.setHeader("X-Content-Type-Options","nosniff");response.setHeader("Referrer-Policy","same-origin");response.end(JSON.stringify(payload));}

export default async function handler(request:any,response:any){
 const method=String(request.method||"GET").toUpperCase();
 if(!sameOrigin(request))return send(response,403,{error:{code:"ORIGIN_REJECTED",message:"This request was rejected."}});
 try{
  const staff=staffFromRequest(request);
  if(!staff)return send(response,401,{error:{code:"STAFF_AUTH_REQUIRED",message:"Staff sign-in is required."}});
  if(!canReview(staff)){await recordSecurityEvent({request,eventType:"return_review_access_denied",eventStatus:"blocked",riskLevel:"high",subject:staff.employeeId}).catch(()=>undefined);return send(response,403,{error:{code:"RETURN_REVIEW_FORBIDDEN",message:"Your staff role is not authorized to review returns."}});}
  if(method==="GET"){
   const url=new URL(request.url||"/api/return-reviews","https://smartcommerce.internal");
   const status=String(url.searchParams.get("status")||"requested");
   return send(response,200,{returns:await listStaffReturns(status),staff:{employeeId:staff.employeeId,username:staff.username,role:staff.role}});
  }
  if(method!=="POST"){response.setHeader("Allow","GET, POST");return send(response,405,{error:{code:"METHOD_NOT_ALLOWED",message:"GET or POST is required."}});}
  const input=await readJsonBody<{id?:string;action?:any;approvedAmountMinor?:number;providerReturnId?:string;refundReference?:string;staffNotes?:string;publicMessage?:string}>(request);
  const updated=await reviewReturnRequest({id:String(input.id||""),staffId:staff.employeeId,action:input.action,approvedAmountMinor:input.approvedAmountMinor,providerReturnId:input.providerReturnId,refundReference:input.refundReference,staffNotes:input.staffNotes,publicMessage:input.publicMessage});
  await recordSecurityEvent({request,eventType:"return_review_updated",eventStatus:String(updated.status||"updated"),riskLevel:"medium",subject:staff.employeeId,metadata:{returnId:updated.id,orderId:updated.order_id,status:updated.status}}).catch(()=>undefined);
  return send(response,200,{return:updated});
 }catch(error:any){
  if(error instanceof SyntaxError)return send(response,400,{error:{code:"INVALID_JSON",message:"The request body is invalid."}});
  if(Number(error?.status)===413)return send(response,413,{error:{code:"REQUEST_TOO_LARGE",message:"The request is too large."}});
  if(error?.message==="RETURN_NOT_FOUND")return send(response,404,{error:{code:"RETURN_NOT_FOUND",message:"That return request was not found."}});
  if(error?.message==="REFUND_REFERENCE_REQUIRED")return send(response,400,{error:{code:"REFUND_REFERENCE_REQUIRED",message:"A verified refund reference is required before marking a refund completed."}});
  if(error?.message==="RETURN_ACTION_INVALID")return send(response,400,{error:{code:"RETURN_ACTION_INVALID",message:"That return action is not supported."}});
  console.error("return_reviews_api_error",{code:error instanceof Error?error.message:"unknown"});
  return send(response,503,{error:{code:"RETURN_REVIEWS_UNAVAILABLE",message:"Return reviews are temporarily unavailable.",retryable:true}});
 }
}
