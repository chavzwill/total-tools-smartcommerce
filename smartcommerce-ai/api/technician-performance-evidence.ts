import { firstHeader } from "../src/server/securityInfrastructure.js";
import { parseCookie, readStaffSession, STAFF_COOKIE_NAME } from "../src/server/staffSession.js";
import { collectTechnicianPerformanceEvidence } from "../src/server/technicianPerformanceEvidence.js";

function send(res: any, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.end(JSON.stringify(payload));
}

function staff(req: any) {
  const token = parseCookie(firstHeader(req.headers?.cookie))[STAFF_COOKIE_NAME];
  return readStaffSession(token);
}

function canReview(session: any) {
  const role = String(session?.role || "").toLowerCase();
  const group = String(session?.securityGroupName || "").toLowerCase();
  return role === "admin" || role === "owner" || group.includes("admin") || session?.permissions?.technician_compensation_admin === true || session?.permissions?.technician_compensation_review === true || session?.permissions?.wo_supervisor === true;
}

export default async function handler(req: any, res: any) {
  try {
    const session = staff(req);
    if (!session) return send(res, 401, { error: { code: "STAFF_AUTH_REQUIRED", message: "Staff sign in is required." } });
    if (String(req.method || "GET").toUpperCase() !== "GET") {
      res.setHeader("Allow", "GET");
      return send(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "GET is required." } });
    }

    const employeeId = String(req.query?.employeeId || "").trim();
    const own = employeeId && employeeId === String(session.employeeId || "");
    if (!employeeId || (!own && !canReview(session))) {
      return send(res, 403, { error: { code: "TECHNICIAN_EVIDENCE_ACCESS_DENIED", message: "Supervisor access is required to review another technician's evidence." } });
    }
    const periodRef = String(req.query?.periodRef || new Date().toISOString().slice(0, 10)).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodRef)) {
      return send(res, 400, { error: { code: "INVALID_PERIOD_REFERENCE", message: "A valid pay-period date is required." } });
    }

    const evidence = await collectTechnicianPerformanceEvidence(employeeId, periodRef);
    return send(res, 200, { evidence });
  } catch (error) {
    const code = error instanceof Error ? error.message : "TECHNICIAN_EVIDENCE_UNAVAILABLE";
    console.error("technician_performance_evidence_error", { code });
    return send(res, 503, { error: { code: code === "POS_NOT_CONFIGURED" ? code : "TECHNICIAN_EVIDENCE_UNAVAILABLE", message: "Technician performance evidence is temporarily unavailable.", retryable: true } });
  }
}
