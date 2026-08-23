import { canStaff, parseCookie, readStaffSession, STAFF_COOKIE_NAME } from "../src/server/staffSession.js";
import { firstHeader, recordSecurityEvent } from "../src/server/securityInfrastructure.js";
import { listRefundReconciliationExceptions } from "../src/server/refundReconciliation.js";

function sameOrigin(request: any) {
  const origin = firstHeader(request.headers?.origin);
  if (!origin) return true;
  const host = firstHeader(request.headers?.host);
  if (!host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

function staffFromRequest(request: any) {
  const token = parseCookie(firstHeader(request.headers?.cookie))[STAFF_COOKIE_NAME];
  return readStaffSession(token);
}

function canReview(staff: ReturnType<typeof staffFromRequest>) {
  return canStaff(staff, "purchasing_approve") || canStaff(staff, "security_manage") || canStaff(staff, "delivery_review");
}

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
  if (!sameOrigin(request)) return send(response, 403, { error: { code: "ORIGIN_REJECTED", message: "This request was rejected." } });

  try {
    const staff = staffFromRequest(request);
    if (!staff) return send(response, 401, { error: { code: "STAFF_AUTH_REQUIRED", message: "Staff sign-in is required." } });
    if (!canReview(staff)) {
      await recordSecurityEvent({ request, eventType: "refund_reconciliation_access_denied", eventStatus: "blocked", riskLevel: "high", subject: staff.employeeId }).catch(() => undefined);
      return send(response, 403, { error: { code: "REFUND_RECONCILIATION_FORBIDDEN", message: "Your staff role is not authorized to review refund reconciliation." } });
    }

    const exceptions = await listRefundReconciliationExceptions();
    return send(response, 200, {
      exceptions,
      summary: {
        total: exceptions.length,
        unmatched: exceptions.filter((item) => item.state === "refund_unmatched").length,
        amountMismatch: exceptions.filter((item) => item.state === "refund_amount_mismatch").length,
        referenceMismatch: exceptions.filter((item) => item.state === "refund_reference_mismatch").length,
      },
      staff: { employeeId: staff.employeeId, username: staff.username, role: staff.role },
    });
  } catch (error: any) {
    console.error("refund_reconciliation_api_error", { code: error instanceof Error ? error.message : "unknown" });
    return send(response, 503, { error: { code: "REFUND_RECONCILIATION_UNAVAILABLE", message: "Refund reconciliation is temporarily unavailable.", retryable: true } });
  }
}
