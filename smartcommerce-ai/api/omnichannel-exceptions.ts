import { firstHeader, recordSecurityEvent } from "../src/server/securityInfrastructure.js";
import { canStaff, parseCookie, readStaffSession, STAFF_COOKIE_NAME } from "../src/server/staffSession.js";
import { buildOmnichannelExceptions } from "../src/server/omnichannelExceptions.js";
import { listExceptionNotificationHistory, synchronizeExceptionNotifications, updateExceptionNotification } from "../src/server/exceptionNotifications.js";

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
  const host = firstHeader(req.headers?.host);
  if (!host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}
async function readBody(req: AsyncIterable<unknown>) {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    if (chunk == null) continue;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    total += buffer.length;
    if (total > 32_000) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<string, any>;
}

export default async function handler(req: any, res: any) {
  const method = String(req.method || "GET").toUpperCase();
  try {
    const staff = readStaffSession(parseCookie(firstHeader(req.headers?.cookie))[STAFF_COOKIE_NAME]);
    if (!staff) return send(res, 401, { error: { code: "STAFF_AUTH_REQUIRED", message: "Staff sign-in is required." } });
    if (!canStaff(staff, "reports")) return send(res, 403, { error: { code: "STAFF_PERMISSION_DENIED", message: "Reports permission is required to manage cross-channel exceptions." } });

    if (method === "GET") {
      const view = String(req.query?.view || "notifications");
      if (view === "history") {
        const exceptionId = String(req.query?.exception_id || "").trim();
        if (!exceptionId) return send(res, 400, { error: { code: "EXCEPTION_ID_REQUIRED", message: "Exception id is required." } });
        return send(res, 200, { success: true, data: await listExceptionNotificationHistory(exceptionId) });
      }
      if (view === "report") {
        const data = await buildOmnichannelExceptions({ refresh: String(req.query?.refresh || "1") !== "0", limit: Number(req.query?.limit || 200) });
        return send(res, 200, { success: true, data });
      }
      const notifications = await synchronizeExceptionNotifications({ refresh: String(req.query?.refresh || "1") !== "0", limit: Number(req.query?.limit || 200) });
      const active = notifications.filter((row: any) => row.state !== "resolved" && (!row.snoozed_until || new Date(row.snoozed_until).getTime() <= Date.now()));
      const summary = {
        total: active.length,
        critical: active.filter((row: any) => row.severity === "critical").length,
        high: active.filter((row: any) => row.severity === "high").length,
        unassigned: active.filter((row: any) => !row.owner_employee_id).length,
        escalated: active.filter((row: any) => Number(row.escalation_level || 0) > 0).length,
      };
      return send(res, 200, { success: true, data: { summary, notifications, active } });
    }

    if (method === "PATCH") {
      if (!sameOrigin(req)) return send(res, 403, { error: { code: "ORIGIN_REJECTED", message: "This request was rejected." } });
      const input = await readBody(req);
      const action = String(input.action || "").trim() as "claim" | "acknowledge" | "snooze" | "resolve" | "reopen";
      if (!["claim", "acknowledge", "snooze", "resolve", "reopen"].includes(action)) return send(res, 400, { error: { code: "EXCEPTION_ACTION_INVALID", message: "Use claim, acknowledge, snooze, resolve or reopen." } });
      const exceptionId = String(input.exceptionId || "").trim();
      if (!exceptionId) return send(res, 400, { error: { code: "EXCEPTION_ID_REQUIRED", message: "Exception id is required." } });
      const updated = await updateExceptionNotification({ exceptionId, action, employeeId: staff.employeeId, note: input.note ? String(input.note) : null, snoozeHours: input.snoozeHours });
      await recordSecurityEvent({ request: req, eventType: `management_exception_${action}`, eventStatus: "success", riskLevel: action === "resolve" ? "medium" : "info", subject: staff.employeeId, metadata: { exceptionId, action } }).catch(() => undefined);
      return send(res, 200, { success: true, data: updated });
    }

    res.setHeader("Allow", "GET, PATCH");
    return send(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "GET or PATCH is required." } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "OMNICHANNEL_EXCEPTION_REPORT_FAILED";
    console.error("omnichannel_exception_report_error", { code, method });
    const status = code === "REQUEST_TOO_LARGE" ? 413 : code.endsWith("_REQUIRED") || code.endsWith("_INVALID") ? 400 : 503;
    return send(res, status, { error: { code, message: "Management exception service is temporarily unavailable." } });
  }
}
