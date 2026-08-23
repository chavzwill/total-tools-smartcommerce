import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { ensureCommercialAccountingSchema } from "../src/server/commercialAccountingLedger.js";
import { ensureDeliveryLifecycleSchema } from "../src/server/deliveryLifecycleStore.js";
import { ensureReturnSchema } from "../src/server/returnRequestStore.js";
import { enforceDurableRateLimit, firstHeader, requestIp } from "../src/server/securityInfrastructure.js";

const COOKIE_NAME="sc_session";
let sqlClient:ReturnType<typeof neon>|undefined;
function sql(){if(!sqlClient){const url=process.env.SMARTCOMMERCE_DATABASE_URL||process.env.DATABASE_URL;if(!url)throw new Error("COMMERCE_DATABASE_NOT_CONFIGURED");sqlClient=neon(url);}return sqlClient;}
function parseCookie(header?:string){const out:Record<string,string>={};for(const part of(header||"").split(";")){const i=part.indexOf("=");if(i<=0)continue;try{out[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1).trim());}catch{out[part.slice(0,i).trim()]=part.slice(i+1).trim();}}return out;}
function hashToken(token:string){return createHash("sha256").update(token).digest("hex");}
async function currentCustomerId(request:any){const token=parseCookie(firstHeader(request.headers?.cookie))[COOKIE_NAME];if(!token)return undefined;const rows=await sql()`SELECT customer_id FROM customer_sessions WHERE token_hash=${hashToken(token)} AND revoked_at IS NULL AND expires_at>NOW() LIMIT 1` as Array<{customer_id:string}>;return rows[0]?.customer_id;}
function send(response:any,status:number,payload:unknown){response.statusCode=status;response.setHeader("Content-Type","application/json");response.setHeader("Cache-Control","no-store");response.setHeader("X-Content-Type-Options","nosniff");response.setHeader("Referrer-Policy","same-origin");response.end(JSON.stringify(payload));}
function jsonObject(value:unknown){if(!value)return{};if(typeof value==="string"){try{const parsed=JSON.parse(value);return parsed&&typeof parsed==="object"?parsed:{};}catch{return{};}}return typeof value==="object"?value as Record<string,unknown>:{};}
function norm(value:unknown){return String(value||"").trim().toLowerCase();}
function publicRefundState(row:any){
 if(!row.return_id||row.requested_resolution!=="refund")return null;
 const status=String(row.return_status||"");
 if(status==="refund_pending")return "pending";
 if(!["refund_completed","closed"].includes(status))return "return_in_progress";
 const approved=Number(row.approved_amount_minor??row.requested_amount_minor??0);
 const refunded=Number(row.ledger_refund_minor||0);
 const count=Number(row.ledger_refund_count||0);
 if(count<1)return "verification_pending";
 if(approved>0&&refunded!==approved)return "verification_pending";
 const expected=norm(row.refund_reference);
 if(expected&&!row.refund_reference_matched)return "verification_pending";
 return "reconciled";
}

export default async function handler(request:any,response:any){
 if(String(request.method||"GET").toUpperCase()!=="GET"){response.setHeader("Allow","GET");return send(response,405,{error:{code:"METHOD_NOT_ALLOWED",message:"GET is required."}});}
 try{
  const customerId=await currentCustomerId(request);
  if(!customerId)return send(response,401,{error:{code:"AUTH_REQUIRED",message:"Sign in to view your orders."}});
  await enforceDurableRateLimit({request,action:"customer_orders",subject:customerId||requestIp(request),limit:120,windowSeconds:600});
  await Promise.all([ensureCommercialAccountingSchema(),ensureDeliveryLifecycleSchema(),ensureReturnSchema()]);
  const orderId=String(request.query?.orderId||"").trim().slice(0,180);
  const rows=await sql()`
    SELECT l.order_id,l.reference,l.external_reference,l.purchase_order_reference,l.description,l.currency,
           l.debit_minor,l.occurred_at,l.due_at,l.status AS ledger_status,l.source,l.source_coverage,l.metadata,
           d.status AS fulfilment_status,d.fulfilment_mode,d.provider AS delivery_provider,d.service_label,
           d.collection_point_name,d.scheduled_for,d.tracking_reference,d.exception_message,d.completed_at,
           r.id AS return_id,r.status AS return_status,r.requested_resolution,r.requested_amount_minor,
           r.approved_amount_minor,r.refund_reference,
           rf.ledger_refund_minor,rf.ledger_refund_count,rf.refund_reference_matched
    FROM commercial_account_ledger_entries l
    LEFT JOIN delivery_lifecycles d ON d.order_id=l.order_id AND d.customer_id=l.customer_id
    LEFT JOIN LATERAL (
      SELECT id,status,requested_resolution,requested_amount_minor,approved_amount_minor,refund_reference
      FROM return_requests rr WHERE rr.order_id=l.order_id AND rr.customer_id=l.customer_id
      ORDER BY rr.created_at DESC LIMIT 1
    ) r ON TRUE
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(le.credit_minor),0)::bigint AS ledger_refund_minor,
             COUNT(le.id)::int AS ledger_refund_count,
             BOOL_OR(
               LOWER(COALESCE(le.external_reference,''))=LOWER(COALESCE(r.refund_reference,'')) OR
               LOWER(COALESCE(le.reference,''))=LOWER(COALESCE(r.refund_reference,''))
             ) AS refund_reference_matched
      FROM commercial_account_ledger_entries le
      WHERE le.customer_id=l.customer_id AND le.order_id=l.order_id AND le.entry_type='refund'
    ) rf ON TRUE
    WHERE l.customer_id=${customerId} AND l.entry_type='order_charge' AND l.order_id IS NOT NULL
      ${orderId?sql()`AND l.order_id=${orderId}`:sql()``}
    ORDER BY l.occurred_at DESC,l.created_at DESC LIMIT ${orderId?1:100}
  ` as unknown as Array<any>;
  if(orderId&&!rows[0])return send(response,404,{error:{code:"ORDER_NOT_FOUND",message:"That order was not found on this account."}});
  const orders=rows.map((row)=>{const metadata=jsonObject(row.metadata);return{
    id:String(row.order_id),reference:String(row.reference||row.order_id),externalReference:row.external_reference||null,
    purchaseOrderReference:row.purchase_order_reference||null,description:row.description||null,currency:String(row.currency||"JMD"),
    totalMinor:Number(row.debit_minor||0),orderedAt:row.occurred_at,dueAt:row.due_at||null,status:row.ledger_status||"submitted",
    sourceCoverage:row.source_coverage||"smartcommerce_only",
    fulfilment:{status:row.fulfilment_status||"order_received",mode:row.fulfilment_mode||metadata.fulfilmentMode||"pickup",provider:row.delivery_provider||metadata.deliveryProvider||null,serviceLabel:row.service_label||metadata.deliveryServiceLabel||null,collectionPointName:row.collection_point_name||metadata.collectionPointName||null,scheduledFor:row.scheduled_for||null,trackingReference:row.tracking_reference||null,exceptionMessage:row.exception_message||null,completedAt:row.completed_at||null},
    deliveryMinor:Number(metadata.deliveryMinor||0),paymentTermsCode:metadata.paymentTermsCode||null,commercialAccountId:metadata.commercialAccountId||null,
    returnRequest:row.return_id?{id:row.return_id,status:row.return_status,resolution:row.requested_resolution,approvedAmountMinor:row.approved_amount_minor==null?null:Number(row.approved_amount_minor),refundReference:row.refund_reference||null,refundReconciliation:publicRefundState(row)}:null
  };});
  return send(response,200,orderId?{order:orders[0]}:{orders});
 }catch(error:any){
  if(error?.message==="RATE_LIMITED")return send(response,429,{error:{code:"RATE_LIMITED",message:"Too many order requests. Please wait and try again."}});
  console.error("customer_orders_api_error",{code:error instanceof Error?error.message:"unknown"});
  return send(response,503,{error:{code:"ORDERS_UNAVAILABLE",message:"Your orders are temporarily unavailable.",retryable:true}});
 }
}
