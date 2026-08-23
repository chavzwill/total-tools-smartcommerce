import { timingSafeEqual } from "node:crypto";
import { enforceDurableRateLimit, firstHeader, recordSecurityEvent, requestIp } from "../src/server/securityInfrastructure.js";
import { canStaff, parseCookie, readStaffSession, STAFF_COOKIE_NAME, type StaffSession } from "../src/server/staffSession.js";
import { channelReport, ingestExport, listIntakeItems, recordChannelEvent, reviewIntakeItem } from "../src/server/omnichannelIntake.js";

const MAX_BODY_BYTES = 256 * 1024;

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

async function readJson(request: AsyncIterable<unknown>) {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    if (chunk === undefined || chunk === null) continue;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    total += buffer.length;
    if (total > MAX_BODY_BYTES) throw Object.assign(new Error("REQUEST_TOO_LARGE"), { status: 413 });
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<string, any>;
}

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function trustedIntegration(request: any) {
  const configured = process.env.SMARTCOMMERCE_OMNICHANNEL_INGEST_KEY?.trim() || "";
  if (configured.length < 24) return false;
  const supplied = String(firstHeader(request.headers?.["x-smartcommerce-integration-key"]) || "").trim();
  return supplied.length > 0 && secureEqual(supplied, configured);
}

function staffSession(request: any) {
  return readStaffSession(parseCookie(firstHeader(request.headers?.cookie))[STAFF_COOKIE_NAME]);
}

function mayViewQueue(staff: StaffSession) {
  return [
    "reports", "quotations_approve", "pr_approve", "purchasing_approve", "inventory_edit",
    "rentals_manage_items", "wo_assess", "customers_edit",
  ].some((permission) => canStaff(staff, permission));
}

function mayApprove(staff: StaffSession, itemType: string) {
  const type = itemType.toLowerCase();
  if (/quote|commercial/.test(type)) return canStaff(staff, "quotations_approve");
  if (/purchase_request|requisition/.test(type)) return canStaff(staff, "pr_approve");
  if (/purchase_order/.test(type)) return canStaff(staff, "purchasing_approve");
  if (/inventory|stock/.test(type)) return canStaff(staff, "inventory_edit");
  if (/rental/.test(type)) return canStaff(staff, "rentals_manage_items");
  if (/repair|work_order/.test(type)) return canStaff(staff, "wo_assess");
  if (/customer/.test(type)) return canStaff(staff, "customers_edit");
  return canStaff(staff, "reports");
}

export default async function handler(request: any, response: any) {
  const method = String(request.method || "GET").toUpperCase();
  try {
    if (method === "GET") {
      const staff = staffSession(request);
      if (!staff) return send(response, 401, { success: false, error: { code: "STAFF_AUTH_REQUIRED", message: "Staff sign-in is required." } });
      const view = String(request.query?.view || "queue");
      if (view === "report") {
        if (!canStaff(staff, "reports")) return send(response, 403, { success: false, error: { code: "STAFF_PERMISSION_DENIED", message: "Your security group does not allow omnichannel reporting." } });
        const start = String(request.query?.start || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10));
        const end = String(request.query?.end || new Date().toISOString().slice(0, 10));
        return send(response, 200, { success: true, data: await channelReport({ start, end }) });
      }
      if (!mayViewQueue(staff)) return send(response, 403, { success: false, error: { code: "STAFF_PERMISSION_DENIED", message: "Your security group does not allow integration review queues." } });
      const items = await listIntakeItems({ status: request.query?.status ? String(request.query.status) : undefined, sourceChannel: request.query?.source ? String(request.query.source) : undefined, limit: Number(request.query?.limit || 200) });
      return send(response, 200, { success: true, data: items });
    }

    if (method === "PATCH") {
      if (!sameOrigin(request)) return send(response, 403, { success: false, error: { code: "ORIGIN_REJECTED", message: "This request was rejected." } });
      const staff = staffSession(request);
      if (!staff) return send(response, 401, { success: false, error: { code: "STAFF_AUTH_REQUIRED", message: "Staff sign-in is required." } });
      const input = await readJson(request);
      const id = String(input.id || "").trim();
      const decision = input.decision === "rejected" ? "rejected" : input.decision === "approved" ? "approved" : "";
      const itemType = String(input.itemType || "").trim();
      if (!id || !decision || !itemType) return send(response, 400, { success: false, error: { code: "INVALID_REVIEW_DECISION", message: "Review id, item type and approve/reject decision are required." } });
      if (!mayApprove(staff, itemType)) return send(response, 403, { success: false, error: { code: "STAFF_PERMISSION_DENIED", message: "Your security group does not allow approval of this record type." } });
      const row = await reviewIntakeItem({ id, decision, employeeId: staff.employeeId, note: String(input.note || "").slice(0, 1000) || null });
      await recordSecurityEvent({ request, eventType: "omnichannel_review_decision", eventStatus: decision, riskLevel: decision === "approved" ? "medium" : "low", subject: staff.employeeId, metadata: { intakeId: id, itemType } }).catch(() => undefined);
      return send(response, 200, { success: true, data: row });
    }

    if (method !== "POST") {
      response.setHeader("Allow", "GET, POST, PATCH");
      return send(response, 405, { success: false, error: { code: "METHOD_NOT_ALLOWED", message: "GET, POST or PATCH is required." } });
    }

    const input = await readJson(request);
    const kind = String(input.kind || "event");
    if (kind === "event") {
      if (!sameOrigin(request) && !trustedIntegration(request)) return send(response, 403, { success: false, error: { code: "EVENT_SOURCE_REJECTED", message: "This event source is not trusted." } });
      await enforceDurableRateLimit({ request, action: "omnichannel_event", subject: requestIp(request), limit: 600, windowSeconds: 300 });
      const eventType = String(input.eventType || "").trim();
      if (!eventType || eventType.length > 120) return send(response, 400, { success: false, error: { code: "EVENT_TYPE_REQUIRED", message: "A valid event type is required." } });
      const row = await recordChannelEvent({
        sourceChannel: String(input.sourceChannel || "website"), sourceApplication: String(input.sourceApplication || "smartcommerce-web"),
        eventType, entityType: input.entityType ? String(input.entityType) : null, entityId: input.entityId ? String(input.entityId) : null,
        customerId: input.customerId ? String(input.customerId) : null, branchId: input.branchId ? String(input.branchId) : null,
        sessionId: input.sessionId ? String(input.sessionId) : null, occurredAt: input.occurredAt ? String(input.occurredAt) : undefined,
        payload: input.payload || {}, metadata: input.metadata || {},
      });
      return send(response, 202, { success: true, data: row });
    }

    if (kind === "export") {
      if (!trustedIntegration(request) && !sameOrigin(request)) return send(response, 403, { success: false, error: { code: "INTEGRATION_AUTH_REQUIRED", message: "A trusted SmartCommerce integration key is required." } });
      const idempotencyKey = String(firstHeader(request.headers?.["idempotency-key"]) || input.idempotencyKey || "").trim();
      const row = await ingestExport({
        idempotencyKey, sourceChannel: String(input.sourceChannel || "smartcommerce"), sourceApplication: String(input.sourceApplication || "smartcommerce"),
        externalId: input.externalId ? String(input.externalId) : null, itemType: String(input.itemType || ""), entityType: input.entityType ? String(input.entityType) : null,
        entityId: input.entityId ? String(input.entityId) : null, customerId: input.customerId ? String(input.customerId) : null, branchId: input.branchId ? String(input.branchId) : null,
        requiresReview: Boolean(input.requiresReview || input.decision === "manual_review" || input.status === "manual_review" || input.status === "under_review"),
        priority: String(input.priority || "normal"), reviewReason: input.reviewReason ? String(input.reviewReason).slice(0, 1000) : null,
        payload: input.payload || {}, metadata: input.metadata || {},
      });
      return send(response, 202, { success: true, data: row });
    }

    return send(response, 400, { success: false, error: { code: "OMNICHANNEL_KIND_INVALID", message: "Use kind=event or kind=export." } });
  } catch (error) {
    const err = error as Error & { status?: number };
    const status = err.status || (err.message === "OMNICHANNEL_REVIEW_STATE_CONFLICT" ? 409 : 500);
    console.error("omnichannel_api_error", { code: err.message, method });
    return send(response, status, { success: false, error: { code: err.message || "OMNICHANNEL_ERROR", message: status >= 500 ? "Omnichannel processing is temporarily unavailable." : err.message } });
  }
}
