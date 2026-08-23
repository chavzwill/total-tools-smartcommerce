import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { firstHeader, recordSecurityEvent } from "../src/server/securityInfrastructure.js";
import { canStaff, parseCookie, readStaffSession, STAFF_COOKIE_NAME } from "../src/server/staffSession.js";
import { listOutcomeLinks, refreshOutcomeLink, registerOutcomeLink } from "../src/server/omnichannelOutcomeSync.js";

const CUSTOMER_COOKIE = "sc_session";
let sqlClient: ReturnType<typeof neon> | undefined;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("OMNICHANNEL_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}
function send(res: any, status: number, payload: unknown) {
  res.statusCode = status; res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); res.setHeader("X-Content-Type-Options", "nosniff"); res.end(JSON.stringify(payload));
}
function sameOrigin(req: any) { const origin = firstHeader(req.headers?.origin); if (!origin) return true; const host = firstHeader(req.headers?.host); if (!host) return false; try { return new URL(origin).host === host; } catch { return false; } }
function hashToken(value: string) { return createHash("sha256").update(value).digest("hex"); }
async function readBody(req: AsyncIterable<unknown>) { const chunks: Buffer[] = []; let total = 0; for await (const chunk of req) { if (chunk == null) continue; const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)); total += buffer.length; if (total > 64_000) throw new Error("REQUEST_TOO_LARGE"); chunks.push(buffer); } return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<string, any>; }
async function customerIdentity(req: any) {
  const cookies = parseCookie(firstHeader(req.headers?.cookie));
  const token = cookies[CUSTOMER_COOKIE];
  if (!token) return null;
  const rows = await sql()`SELECT c.id,c.email_verified FROM customer_sessions s JOIN customer_accounts c ON c.id=s.customer_id WHERE s.token_hash=${hashToken(token)} AND s.revoked_at IS NULL AND s.expires_at>NOW() LIMIT 1` as Array<{ id: string; email_verified: boolean }>;
  const account = rows[0]; if (!account) return null;
  const links = await sql()`SELECT pos_customer_id FROM customer_pos_links WHERE customer_account_id=${account.id} LIMIT 1` as Array<{ pos_customer_id: string }>;
  return { accountId: account.id, emailVerified: Boolean(account.email_verified), posCustomerId: links[0]?.pos_customer_id || null };
}

export default async function handler(req: any, res: any) {
  const method = String(req.method || "GET").toUpperCase();
  try {
    if (method === "GET") {
      const customer = await customerIdentity(req);
      if (customer) {
        if (!customer.emailVerified) return send(res, 403, { error: { code: "VERIFIED_ACCOUNT_REQUIRED", message: "Verify your email before viewing connected order activity." } });
        const ids = [customer.accountId, customer.posCustomerId].filter(Boolean) as string[];
        const rows = await listOutcomeLinks({ customerIds: ids, limit: Number(req.query?.limit || 100), refresh: String(req.query?.refresh || "1") !== "0" });
        return send(res, 200, { success: true, outcomes: rows.map((row: any) => ({ intakeId: row.intake_id, itemType: row.item_type, sourceChannel: row.source_channel, resource: row.resource, reference: row.reference, status: row.authoritative_status, fulfillmentStatus: row.fulfillment_status, snapshot: row.safe_snapshot || {}, lastSyncedAt: row.last_synced_at, syncWarning: row.last_sync_error ? "Live status refresh was unavailable; showing the latest synchronized status." : undefined })) });
      }
      const staffToken = parseCookie(firstHeader(req.headers?.cookie))[STAFF_COOKIE_NAME];
      const staff = readStaffSession(staffToken);
      if (!staff || !canStaff(staff, "reports")) return send(res, 401, { error: { code: "AUTH_REQUIRED", message: "Sign in to view synchronized outcomes." } });
      const rows = await listOutcomeLinks({ limit: Number(req.query?.limit || 200), refresh: String(req.query?.refresh || "1") !== "0" });
      return send(res, 200, { success: true, outcomes: rows });
    }

    if (method !== "POST") { res.setHeader("Allow", "GET, POST"); return send(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "GET or POST is required." } }); }
    if (!sameOrigin(req)) return send(res, 403, { error: { code: "ORIGIN_REJECTED", message: "This request was rejected." } });
    const staff = readStaffSession(parseCookie(firstHeader(req.headers?.cookie))[STAFF_COOKIE_NAME]);
    if (!staff) return send(res, 401, { error: { code: "STAFF_AUTH_REQUIRED", message: "Staff sign-in is required." } });
    const input = await readBody(req);
    const action = String(input.action || "register");
    if (action === "register") {
      if (!["pos", "quotations", "work_orders", "rentals", "purchase_requests", "purchasing", "transfers"].some((permission) => canStaff(staff, permission))) return send(res, 403, { error: { code: "STAFF_PERMISSION_DENIED", message: "Your security group does not allow downstream handoff registration." } });
      const intakeId = String(input.intakeId || "").trim(); const itemType = String(input.itemType || "").trim(); const resource = String(input.resource || "").trim(); const entityId = String(input.entityId || "").trim();
      if (!intakeId || !itemType || !resource || !entityId) return send(res, 400, { error: { code: "OUTCOME_LINK_FIELDS_REQUIRED", message: "Intake id, item type, resource and entity id are required." } });
      const row = await registerOutcomeLink({ intakeId, itemType, resource, entityId, reference: input.reference ? String(input.reference).slice(0, 240) : null });
      const refreshed = await refreshOutcomeLink(intakeId);
      await recordSecurityEvent({ request: req, eventType: "omnichannel_outcome_link_registered", eventStatus: "success", riskLevel: "info", subject: staff.employeeId, metadata: { intakeId, resource, entityId } }).catch(() => undefined);
      return send(res, 201, { success: true, data: refreshed || row });
    }
    if (action === "refresh") {
      if (!canStaff(staff, "reports")) return send(res, 403, { error: { code: "STAFF_PERMISSION_DENIED", message: "Reports permission is required to refresh synchronized outcomes." } });
      const intakeId = String(input.intakeId || "").trim(); if (!intakeId) return send(res, 400, { error: { code: "OUTCOME_LINK_REQUIRED", message: "Intake id is required." } });
      return send(res, 200, { success: true, data: await refreshOutcomeLink(intakeId) });
    }
    return send(res, 400, { error: { code: "OUTCOME_ACTION_INVALID", message: "Use register or refresh." } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "OMNICHANNEL_OUTCOME_ERROR";
    console.error("omnichannel_outcome_api_error", { code, method });
    return send(res, code === "REQUEST_TOO_LARGE" ? 413 : 503, { error: { code, message: "Connected activity synchronization is temporarily unavailable." } });
  }
}
