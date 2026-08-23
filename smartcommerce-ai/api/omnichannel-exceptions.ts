import { firstHeader } from "../src/server/securityInfrastructure.js";
import { canStaff, parseCookie, readStaffSession, STAFF_COOKIE_NAME } from "../src/server/staffSession.js";
import { buildOmnichannelExceptions } from "../src/server/omnichannelExceptions.js";

function send(res: any, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(payload));
}

export default async function handler(req: any, res: any) {
  const method = String(req.method || "GET").toUpperCase();
  if (method !== "GET") { res.setHeader("Allow", "GET"); return send(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "GET is required." } }); }
  try {
    const staff = readStaffSession(parseCookie(firstHeader(req.headers?.cookie))[STAFF_COOKIE_NAME]);
    if (!staff) return send(res, 401, { error: { code: "STAFF_AUTH_REQUIRED", message: "Staff sign-in is required." } });
    if (!canStaff(staff, "reports")) return send(res, 403, { error: { code: "STAFF_PERMISSION_DENIED", message: "Reports permission is required to view management exceptions." } });
    const data = await buildOmnichannelExceptions({ refresh: String(req.query?.refresh || "1") !== "0", limit: Number(req.query?.limit || 200) });
    return send(res, 200, { success: true, data });
  } catch (error) {
    const code = error instanceof Error ? error.message : "OMNICHANNEL_EXCEPTION_REPORT_FAILED";
    console.error("omnichannel_exception_report_error", { code });
    return send(res, 503, { error: { code, message: "Management exceptions are temporarily unavailable." } });
  }
}
