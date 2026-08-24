import { neon } from "@neondatabase/serverless";
import { createHash, randomUUID } from "node:crypto";
import { createHardenedServerFetch, validateServerIntegrationBaseUrl } from "../src/server/hardenedOutboundFetch.js";
import { firstHeader } from "../src/server/securityInfrastructure.js";

const COOKIE_NAME = "sc_session";
let sqlClient: ReturnType<typeof neon> | undefined;
type Row = Record<string, any>;
type Customer = { id: string; email: string; full_name: string; phone: string | null; email_verified: boolean };

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("CUSTOMER_REPAIR_ACTION_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}
function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
function parseCookie(header?: string) {
  const out: Record<string, string> = {};
  for (const part of (header || "").split(";")) {
    const index = part.indexOf("="); if (index <= 0) continue;
    const key = part.slice(0, index).trim(), raw = part.slice(index + 1).trim();
    try { out[key] = decodeURIComponent(raw); } catch { out[key] = raw; }
  }
  return out;
}
function send(res: any, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(payload));
}
function sameOrigin(req: any) {
  const origin = firstHeader(req.headers?.origin);
  if (!origin) return true;
  const host = firstHeader(req.headers?.["x-forwarded-host"]) || firstHeader(req.headers?.host);
  const proto = firstHeader(req.headers?.["x-forwarded-proto"]) || "https";
  if (!host) return false;
  try { return new URL(origin).origin === `${proto}://${host}`; } catch { return false; }
}
async function sessionCustomer(req: any): Promise<Customer | null> {
  const token = parseCookie(firstHeader(req.headers?.cookie))[COOKIE_NAME]; if (!token) return null;
  const rows = await sql()`SELECT c.id,c.email,c.full_name,c.phone,c.email_verified FROM customer_sessions s JOIN customer_accounts c ON c.id=s.customer_id WHERE s.token_hash=${hashToken(token)} AND s.revoked_at IS NULL AND s.expires_at>NOW() LIMIT 1` as Row[];
  return (rows[0] as Customer) || null;
}
function configuredPos() {
  const raw = process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_URL?.trim();
  if (!raw) throw new Error("POS_NOT_CONFIGURED");
  return validateServerIntegrationBaseUrl(raw).toString().replace(/\/$/, "");
}
async function posPost(path: string, payload: Record<string, unknown>) {
  const key = process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_API_KEY?.trim();
  if (!key) throw new Error("POS_API_KEY_NOT_CONFIGURED");
  const url = new URL(`${configuredPos()}/api/${path.replace(/^\/+/, "")}`);
  const response = await createHardenedServerFetch({ timeoutMs: 9000, maxResponseBytes: 1_000_000 })(url, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "X-API-Key": key },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const safeMessage = typeof body?.error === "string" ? body.error : "Total Tools could not accept that repair action.";
    const error = new Error(safeMessage) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return body;
}
async function linkedPosCustomer(accountId: string) {
  const rows = await sql()`SELECT pos_customer_id FROM customer_pos_links WHERE customer_account_id=${accountId} LIMIT 1` as Row[];
  return rows[0]?.pos_customer_id ? String(rows[0].pos_customer_id) : null;
}

export default async function handler(req: any, res: any) {
  try {
    if (String(req.method || "").toUpperCase() !== "POST") { res.setHeader("Allow", "POST"); return send(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "POST is required." } }); }
    if (!sameOrigin(req)) return send(res, 403, { error: { code: "ORIGIN_REJECTED", message: "This repair action must be submitted from SmartCommerce." } });
    const customer = await sessionCustomer(req);
    if (!customer) return send(res, 401, { error: { code: "CUSTOMER_AUTH_REQUIRED", message: "Sign in to manage your repair." } });
    if (!customer.email_verified) return send(res, 403, { error: { code: "VERIFIED_ACCOUNT_REQUIRED", message: "Verify your email before managing repair approvals or messages." } });
    const posCustomerId = await linkedPosCustomer(customer.id);
    if (!posCustomerId) return send(res, 409, { error: { code: "REPAIR_ACCOUNT_NOT_LINKED", message: "Open your Repairs section first so SmartCommerce can securely link your service profile." } });

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const workOrderId = String(body.work_order_id || "").trim();
    if (!/^\d+$/.test(workOrderId)) return send(res, 400, { error: { code: "INVALID_REPAIR", message: "A valid repair is required." } });
    const action = String(body.action || "");
    const externalActionId = `scra_${randomUUID()}`;

    if (action === "estimate_decision") {
      const decision = String(body.decision || "").toLowerCase();
      const estimateRevisionId = Number(body.estimate_revision_id);
      if (!["approved", "rejected"].includes(decision)) return send(res, 400, { error: { code: "INVALID_DECISION", message: "Choose approve or reject." } });
      if (!Number.isInteger(estimateRevisionId) || estimateRevisionId <= 0) return send(res, 400, { error: { code: "INVALID_ESTIMATE", message: "A valid estimate revision is required." } });
      const notes = String(body.notes || "").trim().slice(0, 2000);
      const result = await posPost(`customer-repair-portal/customers/${encodeURIComponent(posCustomerId)}/work-orders/${encodeURIComponent(workOrderId)}/estimate-decisions`, {
        external_action_id: externalActionId,
        estimate_revision_id: estimateRevisionId,
        decision,
        authorized_name: customer.full_name,
        notes,
      });
      return send(res, 200, { ok: true, action: "estimate_decision", result });
    }

    if (action === "message") {
      const message = String(body.message || "").trim().slice(0, 4000);
      if (!message) return send(res, 400, { error: { code: "MESSAGE_REQUIRED", message: "Write a message before sending." } });
      const respondsTo = body.responds_to_communication_id == null ? undefined : Number(body.responds_to_communication_id);
      if (respondsTo !== undefined && (!Number.isInteger(respondsTo) || respondsTo <= 0)) return send(res, 400, { error: { code: "INVALID_RESPONSE_TARGET", message: "The message you are replying to is invalid." } });
      const result = await posPost(`customer-repair-portal/customers/${encodeURIComponent(posCustomerId)}/work-orders/${encodeURIComponent(workOrderId)}/messages`, {
        external_action_id: externalActionId,
        message,
        ...(respondsTo !== undefined ? { responds_to_communication_id: respondsTo } : {}),
      });
      return send(res, 200, { ok: true, action: "message", result });
    }

    return send(res, 400, { error: { code: "UNSUPPORTED_REPAIR_ACTION", message: "That repair action is not supported." } });
  } catch (error) {
    const status = Number((error as any)?.status || 0);
    const message = error instanceof Error ? error.message : "Your repair action could not be completed.";
    console.error("customer_repair_action_error", { code: message, status: status || undefined });
    return send(res, status >= 400 && status < 500 ? status : 503, { error: { code: "CUSTOMER_REPAIR_ACTION_FAILED", message, retryable: status >= 500 || !status } });
  }
}
