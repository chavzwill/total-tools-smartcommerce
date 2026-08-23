import { createHardenedServerFetch, validateServerIntegrationBaseUrl } from "../src/server/hardenedOutboundFetch.js";
import { canStaff, parseCookie, readStaffSession, STAFF_COOKIE_NAME } from "../src/server/staffSession.js";
import { firstHeader, recordSecurityEvent } from "../src/server/securityInfrastructure.js";
import { getOperationsRecovery, listOperationsRecovery, recoveryEntityPath, resolveOperationsRecovery } from "../src/server/operationsRecovery.js";

function send(response: any, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");
  response.end(JSON.stringify(payload));
}

function sameOrigin(request: any) {
  const origin = firstHeader(request.headers?.origin);
  if (!origin) return true;
  const host = firstHeader(request.headers?.host);
  if (!host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

function staffSession(request: any) {
  return readStaffSession(parseCookie(firstHeader(request.headers?.cookie))[STAFF_COOKIE_NAME]);
}

async function readJson(request: AsyncIterable<unknown>) {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk ?? ""));
    total += buffer.length;
    if (total > 64 * 1024) throw Object.assign(new Error("REQUEST_TOO_LARGE"), { status: 413 });
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<string, any>;
}

function configuredPos() {
  const raw = process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_URL?.trim();
  if (!raw) throw new Error("POS_NOT_CONFIGURED");
  return validateServerIntegrationBaseUrl(raw).toString().replace(/\/$/, "");
}

function safeSnapshot(value: any) {
  if (!value || typeof value !== "object") return null;
  const keys = ["id", "transaction_number", "quote_number", "wo_number", "pr_number", "po_number", "transfer_number", "agreement_number", "status", "fulfillment_status", "branch_id", "updated_at", "received_at", "completed_at", "total", "balance_due", "stock_qty", "branch_stock_qty"];
  return Object.fromEntries(keys.filter((key) => value[key] !== undefined).map((key) => [key, value[key]]));
}

export default async function handler(request: any, response: any) {
  const method = String(request.method || "GET").toUpperCase();
  const staff = staffSession(request);
  if (!staff) return send(response, 401, { success: false, error: { code: "STAFF_AUTH_REQUIRED", message: "Staff sign-in is required." } });
  if (!canStaff(staff, "reports") && !canStaff(staff, "security_manage")) return send(response, 403, { success: false, error: { code: "STAFF_PERMISSION_DENIED", message: "Your security group does not allow Operations recovery review." } });

  try {
    if (method === "GET") {
      const rows = await listOperationsRecovery(Number(request.query?.limit || 100));
      return send(response, 200, { success: true, data: rows.map((row) => ({ ...row, record_key: row.record_key, record_key_short: row.record_key.slice(0, 16) })) });
    }
    if (method !== "PATCH") { response.setHeader("Allow", "GET, PATCH"); return send(response, 405, { success: false, error: { code: "METHOD_NOT_ALLOWED", message: "GET or PATCH is required." } }); }
    if (!sameOrigin(request)) return send(response, 403, { success: false, error: { code: "ORIGIN_REJECTED", message: "This request was rejected." } });
    const input = await readJson(request);
    const recordKey = String(input.recordKey || "").trim();
    if (!recordKey) return send(response, 400, { success: false, error: { code: "RECOVERY_RECORD_REQUIRED", message: "A recovery record is required." } });
    const row = await getOperationsRecovery(recordKey);
    if (!row) return send(response, 404, { success: false, error: { code: "OPERATIONS_RECOVERY_NOT_FOUND", message: "That recovery record is no longer open." } });

    if (input.action === "inspect") {
      const entityPath = recoveryEntityPath(row.operation);
      if (!entityPath) return send(response, 200, { success: true, data: { recordKey, operation: row.operation, automatic: false, message: "This write created a new entity or lacks a stable POS identity. Management must verify it by authoritative POS reference before resolving the retry lock." } });
      const baseUrl = configuredPos();
      const url = new URL(`${baseUrl}/api/${entityPath.split("/").map(encodeURIComponent).join("/")}`);
      const apiKey = process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_API_KEY?.trim();
      const headers: Record<string, string> = { Accept: "application/json", "X-SmartCommerce-Actor-Id": staff.employeeId };
      if (apiKey) headers["X-API-Key"] = apiKey;
      if (staff.defaultBranchId) headers["X-SmartCommerce-Branch-Id"] = staff.defaultBranchId;
      const upstream = await createHardenedServerFetch({ timeoutMs: 8000, maxResponseBytes: 512000 })(url, { method: "GET", headers });
      if (upstream.status === 404) return send(response, 200, { success: true, data: { recordKey, operation: row.operation, automatic: true, entityPath, found: false, message: "The exact POS entity could not be found. This alone does not prove a create operation failed." } });
      if (!upstream.ok) return send(response, 502, { success: false, error: { code: "RECOVERY_POS_LOOKUP_FAILED", message: "The authoritative POS record could not be checked." } });
      const payload = await upstream.json().catch(() => null);
      const snapshot = safeSnapshot(payload);
      await recordSecurityEvent({ request, eventType: "staff_operations_recovery_inspected", eventStatus: "success", riskLevel: "medium", subject: staff.employeeId, metadata: { recordKey: recordKey.slice(0, 16), operation: row.operation, entityPath, found: true } }).catch(() => undefined);
      return send(response, 200, { success: true, data: { recordKey, operation: row.operation, automatic: true, entityPath, found: true, snapshot } });
    }

    if (!canStaff(staff, "security_manage")) return send(response, 403, { success: false, error: { code: "STAFF_PERMISSION_DENIED", message: "Security management authority is required to resolve an uncertain mutation." } });
    const resolution = input.action === "confirm_committed" ? "confirmed_committed" : input.action === "release_retry" ? "release_retry" : "";
    if (!resolution) return send(response, 400, { success: false, error: { code: "RECOVERY_ACTION_INVALID", message: "Use inspect, confirm_committed or release_retry." } });
    const result = await resolveOperationsRecovery({ recordKey, actorId: staff.employeeId, resolution, note: String(input.note || ""), reference: input.reference ? String(input.reference) : null });
    return send(response, 200, { success: true, data: result });
  } catch (error) {
    const err = error as Error & { status?: number };
    const known = new Set(["OPERATIONS_RECOVERY_NOT_FOUND", "OPERATIONS_RECOVERY_NOTE_REQUIRED", "OPERATIONS_RECOVERY_STATE_CONFLICT"]);
    const status = err.status || (known.has(err.message) ? 409 : 500);
    console.error("operations_recovery_api_error", { code: err.message, method });
    return send(response, status, { success: false, error: { code: err.message || "OPERATIONS_RECOVERY_ERROR", message: status >= 500 ? "Operations recovery is temporarily unavailable." : err.message } });
  }
}
