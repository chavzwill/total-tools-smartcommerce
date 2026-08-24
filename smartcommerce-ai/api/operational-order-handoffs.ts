import { neon } from "@neondatabase/serverless";
import { canStaff, parseCookie, readStaffSession, STAFF_COOKIE_NAME } from "../src/server/staffSession.js";
import { firstHeader, recordSecurityEvent } from "../src/server/securityInfrastructure.js";
import { ensureOperationalOrderHandoffSchema } from "../src/server/operationalOrderHandoff.js";

let sqlClient: ReturnType<typeof neon> | undefined;
function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("OPERATIONAL_ORDER_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}
function sameOrigin(request:any){ const origin=firstHeader(request.headers?.origin); if(!origin) return true; const host=firstHeader(request.headers?.host); if(!host) return false; try{return new URL(origin).host===host;}catch{return false;} }
function staffFromRequest(request:any){ const token=parseCookie(firstHeader(request.headers?.cookie))[STAFF_COOKIE_NAME]; return readStaffSession(token); }
function canReview(staff:ReturnType<typeof staffFromRequest>){ return canStaff(staff,"purchasing_approve") || canStaff(staff,"security_manage"); }
function send(response: any, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");
  response.end(JSON.stringify(payload));
}

export default async function handler(request: any, response: any) {
  if (String(request.method || "GET").toUpperCase() !== "GET") {
    response.setHeader("Allow", "GET");
    return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "GET is required." } });
  }
  if(!sameOrigin(request)) return send(response,403,{error:{code:"ORIGIN_REJECTED",message:"This request was rejected."}});
  try {
    const staff=staffFromRequest(request);
    if(!staff) return send(response,401,{error:{code:"STAFF_AUTH_REQUIRED",message:"Staff sign-in is required."}});
    if(!canReview(staff)){
      await recordSecurityEvent({request,eventType:"operational_order_handoffs_access_denied",eventStatus:"blocked",riskLevel:"high",subject:staff.employeeId}).catch(()=>undefined);
      return send(response,403,{error:{code:"OPERATIONAL_ORDER_HANDOFFS_FORBIDDEN",message:"Your staff role is not authorized to review operational order handoffs."}});
    }
    await ensureOperationalOrderHandoffSchema();
    const rows = await sql()`
      SELECT o.id, o.payment_attempt_id, o.quote_id, o.subject_kind, o.currency, o.amount_minor,
             o.fulfilment_mode, o.fulfilment_status, o.tracking_reference, o.pos_handoff_status,
             o.pos_order_reference, o.inventory_commitment_status, o.created_at, o.updated_at,
             COALESCE((SELECT COUNT(*) FROM operational_order_inventory_commitments c WHERE c.order_id=o.id),0) AS commitment_lines,
             COALESCE((SELECT COUNT(*) FROM operational_order_outbox q WHERE q.order_id=o.id AND q.status='pending'),0) AS pending_handoffs
      FROM operational_orders o
      ORDER BY o.created_at DESC
      LIMIT 250
    ` as unknown as Array<any>;
    const summary = rows.reduce((acc, row) => {
      acc.total += 1;
      if (row.pos_handoff_status === "pending") acc.pendingPos += 1;
      if (Number(row.pending_handoffs || 0) > 0) acc.pendingOperations += 1;
      if (row.inventory_commitment_status === "committed_internal") acc.internalInventoryCommitments += 1;
      return acc;
    }, { total: 0, pendingPos: 0, pendingOperations: 0, internalInventoryCommitments: 0 });
    return send(response, 200, { summary, orders: rows, staff:{employeeId:staff.employeeId,username:staff.username,role:staff.role} });
  } catch (error) {
    console.error("operational_order_handoffs_api_error", { code: error instanceof Error ? error.message : "unknown" });
    return send(response, 503, { error: { code: "OPERATIONAL_ORDER_HANDOFFS_UNAVAILABLE", message: "Operational order handoffs are temporarily unavailable." } });
  }
}
