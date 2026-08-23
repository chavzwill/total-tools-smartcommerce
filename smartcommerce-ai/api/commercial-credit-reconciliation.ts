import { canStaff, parseCookie, readStaffSession, STAFF_COOKIE_NAME } from "../src/server/staffSession.js";
import { firstHeader, recordSecurityEvent } from "../src/server/securityInfrastructure.js";
import { listCommercialCreditReservationReconciliation } from "../src/server/commercialCreditReconciliation.js";

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
  return canStaff(staff, "purchasing_approve") || canStaff(staff, "security_manage");
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
      await recordSecurityEvent({ request, eventType: "commercial_credit_reconciliation_access_denied", eventStatus: "blocked", riskLevel: "high", subject: staff.employeeId }).catch(() => undefined);
      return send(response, 403, { error: { code: "COMMERCIAL_CREDIT_RECONCILIATION_FORBIDDEN", message: "Your staff role is not authorized to review commercial-credit reconciliation." } });
    }

    const result = await listCommercialCreditReservationReconciliation(250);
    return send(response, 200, { ...result, staff: { employeeId: staff.employeeId, username: staff.username, role: staff.role } });
  } catch (error: any) {
    console.error("commercial_credit_reconciliation_api_error", { code: error instanceof Error ? error.message : "unknown" });
    return send(response, 503, { error: { code: "COMMERCIAL_CREDIT_RECONCILIATION_UNAVAILABLE", message: "Commercial-credit reconciliation is temporarily unavailable.", retryable: true } });
  }
}
