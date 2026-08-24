import { neon } from "@neondatabase/serverless";
import { canStaff, parseCookie, readStaffSession, STAFF_COOKIE_NAME } from "../src/server/staffSession.js";
import { firstHeader, recordSecurityEvent } from "../src/server/securityInfrastructure.js";
import { applyVerifiedProviderEvidence } from "../src/server/paymentProviderEvidence.js";
import { getPaymentProviderAdapter, type PaymentProviderKey } from "../src/server/paymentProviderAdapters.js";

const MAX_BODY_BYTES = 4_000;
let sqlClient: ReturnType<typeof neon> | undefined;
function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("PAYMENT_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}
function sameOrigin(request:any){ const origin=firstHeader(request.headers?.origin); if(!origin) return true; const host=firstHeader(request.headers?.host); if(!host) return false; try{return new URL(origin).host===host;}catch{return false;} }
function staffFromRequest(request:any){ const token=parseCookie(firstHeader(request.headers?.cookie))[STAFF_COOKIE_NAME]; return readStaffSession(token); }
function canReview(staff:ReturnType<typeof staffFromRequest>){ return canStaff(staff,"purchasing_approve") || canStaff(staff,"security_manage"); }
async function readJsonBody<T>(request:AsyncIterable<unknown>):Promise<T>{ const chunks:Buffer[]=[]; let total=0; for await(const chunk of request){ if(chunk==null) continue; const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(String(chunk)); total+=buffer.length; if(total>MAX_BODY_BYTES) throw Object.assign(new Error("BODY_TOO_LARGE"),{status:413}); chunks.push(buffer); } return JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}") as T; }
function send(response:any,status:number,payload:unknown){ response.statusCode=status; response.setHeader("Content-Type","application/json"); response.setHeader("Cache-Control","no-store"); response.setHeader("X-Content-Type-Options","nosniff"); response.setHeader("Referrer-Policy","same-origin"); response.end(JSON.stringify(payload)); }

export default async function handler(request:any,response:any){
  if(String(request.method||"POST").toUpperCase()!=="POST"){ response.setHeader("Allow","POST"); return send(response,405,{error:{code:"METHOD_NOT_ALLOWED",message:"POST is required."}}); }
  if(!sameOrigin(request)) return send(response,403,{error:{code:"ORIGIN_REJECTED",message:"This request was rejected."}});
  try{
    const staff=staffFromRequest(request);
    if(!staff) return send(response,401,{error:{code:"STAFF_AUTH_REQUIRED",message:"Staff sign-in is required."}});
    if(!canReview(staff)){
      await recordSecurityEvent({request,eventType:"payment_provider_recheck_denied",eventStatus:"blocked",riskLevel:"high",subject:staff.employeeId}).catch(()=>undefined);
      return send(response,403,{error:{code:"PAYMENT_RECHECK_FORBIDDEN",message:"Your staff role is not authorized to recheck payment settlement."}});
    }
    const input=await readJsonBody<{attemptId?:string}>(request);
    const attemptId=String(input.attemptId||"").trim();
    if(!attemptId || attemptId.length>100) return send(response,400,{error:{code:"INVALID_PAYMENT_ATTEMPT",message:"Choose a valid payment attempt."}});
    const rows=await sql()`SELECT id,provider,provider_payment_id,status FROM payment_attempts WHERE id=${attemptId} LIMIT 1` as unknown as Array<any>;
    const attempt=rows[0];
    if(!attempt) return send(response,404,{error:{code:"PAYMENT_ATTEMPT_NOT_FOUND",message:"That payment attempt was not found."}});
    if(attempt.status!=="provider_pending") return send(response,409,{error:{code:"PAYMENT_RECHECK_NOT_PENDING",message:"Only provider-pending payments can be rechecked."}});
    const provider=String(attempt.provider||"").trim() as PaymentProviderKey;
    const providerPaymentId=String(attempt.provider_payment_id||"").trim();
    const adapter=getPaymentProviderAdapter(provider);
    if(!adapter || !providerPaymentId) return send(response,409,{error:{code:"PAYMENT_RECHECK_NOT_AVAILABLE",message:"This payment cannot be queried against its provider yet."}});
    const evidence=await adapter.query({attemptId,providerPaymentId});
    const result=await applyVerifiedProviderEvidence(provider,evidence);
    await recordSecurityEvent({request,eventType:"payment_provider_recheck",eventStatus:"completed",riskLevel:"info",subject:staff.employeeId,metadata:{attemptId,provider,applied:result.applied}}).catch(()=>undefined);
    return send(response,200,{attemptId,provider,applied:result.applied,status:"status" in result ? result.status : null});
  }catch(error:any){
    if(error instanceof SyntaxError) return send(response,400,{error:{code:"INVALID_JSON",message:"The request body is invalid."}});
    if(Number(error?.status)===413) return send(response,413,{error:{code:"REQUEST_TOO_LARGE",message:"The request is too large."}});
    const code=error instanceof Error?error.message:"unknown";
    if(code==="PAYMENT_PROVIDER_ADAPTER_NOT_CONFIGURED") return send(response,409,{error:{code:"PAYMENT_PROVIDER_NOT_READY",message:"Server-side provider verification is not configured yet."}});
    if(code.startsWith("PAYMENT_PROVIDER_")){ console.warn("payment_provider_recheck_evidence_rejected",{code}); return send(response,409,{error:{code:"PAYMENT_EVIDENCE_REJECTED",message:"The provider response did not match the authoritative payment attempt."}}); }
    console.error("payment_provider_recheck_error",{code:"recheck_failed"});
    return send(response,503,{error:{code:"PAYMENT_RECHECK_UNAVAILABLE",message:"Payment recheck is temporarily unavailable.",retryable:true}});
  }
}
