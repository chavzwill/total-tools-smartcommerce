import { canStaff, parseCookie, readStaffSession, STAFF_COOKIE_NAME } from "../src/server/staffSession.js";
import { firstHeader, recordSecurityEvent } from "../src/server/securityInfrastructure.js";
import { listPaymentReconciliation } from "../src/server/paymentReconciliation.js";

function sameOrigin(request:any){ const origin=firstHeader(request.headers?.origin); if(!origin) return true; const host=firstHeader(request.headers?.host); if(!host) return false; try{return new URL(origin).host===host;}catch{return false;} }
function staffFromRequest(request:any){ const token=parseCookie(firstHeader(request.headers?.cookie))[STAFF_COOKIE_NAME]; return readStaffSession(token); }
function canReview(staff:ReturnType<typeof staffFromRequest>){ return canStaff(staff,"purchasing_approve") || canStaff(staff,"security_manage"); }
function send(response:any,status:number,payload:unknown){ response.statusCode=status; response.setHeader("Content-Type","application/json"); response.setHeader("Cache-Control","no-store"); response.setHeader("X-Content-Type-Options","nosniff"); response.setHeader("Referrer-Policy","same-origin"); response.end(JSON.stringify(payload)); }

export default async function handler(request:any,response:any){
  if(String(request.method||"GET").toUpperCase()!=="GET"){ response.setHeader("Allow","GET"); return send(response,405,{error:{code:"METHOD_NOT_ALLOWED",message:"GET is required."}}); }
  if(!sameOrigin(request)) return send(response,403,{error:{code:"ORIGIN_REJECTED",message:"This request was rejected."}});
  try{
    const staff=staffFromRequest(request);
    if(!staff) return send(response,401,{error:{code:"STAFF_AUTH_REQUIRED",message:"Staff sign-in is required."}});
    if(!canReview(staff)){
      await recordSecurityEvent({request,eventType:"payment_reconciliation_access_denied",eventStatus:"blocked",riskLevel:"high",subject:staff.employeeId}).catch(()=>undefined);
      return send(response,403,{error:{code:"PAYMENT_RECONCILIATION_FORBIDDEN",message:"Your staff role is not authorized to review payment reconciliation."}});
    }
    const result=await listPaymentReconciliation(300);
    return send(response,200,{...result,staff:{employeeId:staff.employeeId,username:staff.username,role:staff.role}});
  }catch(error:any){
    console.error("payment_reconciliation_api_error",{code:error instanceof Error?error.message:"unknown"});
    return send(response,503,{error:{code:"PAYMENT_RECONCILIATION_UNAVAILABLE",message:"Payment reconciliation is temporarily unavailable.",retryable:true}});
  }
}
