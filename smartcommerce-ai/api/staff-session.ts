import { createHardenedServerFetch, validateServerIntegrationBaseUrl } from "../src/server/hardenedOutboundFetch.js";
import { enforceDurableRateLimit, firstHeader, recordSecurityEvent, requestIp } from "../src/server/securityInfrastructure.js";
import { clearStaffSessionCookie, issueStaffSession, parseCookie, readStaffSession, STAFF_COOKIE_NAME, staffSessionCookie } from "../src/server/staffSession.js";

const MAX_BODY_BYTES = 16_000;

function sameOrigin(request: any) {
  const origin = firstHeader(request.headers?.origin);
  if (!origin) return true;
  const host = firstHeader(request.headers?.host);
  if (!host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

async function readJsonBody<T>(request: AsyncIterable<unknown>): Promise<T> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    if (chunk === undefined || chunk === null) continue;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    total += buffer.length;
    if (total > MAX_BODY_BYTES) {
      const error = new Error("REQUEST_TOO_LARGE") as Error & { status?: number };
      error.status = 413;
      throw error;
    }
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as T;
}

function send(response: any, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");
  response.end(JSON.stringify(payload));
}

function configuredPos() {
  const raw = process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_URL?.trim();
  if (!raw) throw new Error("POS_NOT_CONFIGURED");
  return validateServerIntegrationBaseUrl(raw).toString().replace(/\/$/, "");
}

function sessionEmployee(payload: any) {
  const permissions = payload?.permissions && typeof payload.permissions === "object" ? payload.permissions : {};
  return {
    employeeId: String(payload?.id || ""),
    username: String(payload?.username || ""),
    firstName: payload?.first_name ? String(payload.first_name) : undefined,
    lastName: payload?.last_name ? String(payload.last_name) : undefined,
    role: payload?.role ? String(payload.role) : undefined,
    securityGroupId: payload?.security_group_id == null ? undefined : String(payload.security_group_id),
    securityGroupName: payload?.security_group_name ? String(payload.security_group_name) : undefined,
    defaultBranchId: payload?.default_branch_id == null ? undefined : String(payload.default_branch_id),
    defaultBranchName: payload?.default_branch_name ? String(payload.default_branch_name) : undefined,
    branches: Array.isArray(payload?.branches)
      ? payload.branches.map((branch: any) => ({
          id: String(branch?.id || ""),
          name: branch?.name ? String(branch.name) : undefined,
          branch_code: branch?.branch_code ? String(branch.branch_code) : undefined,
          currency: branch?.currency ? String(branch.currency) : undefined,
          is_default: branch?.is_default,
        })).filter((branch: any) => branch.id)
      : [],
    permissions: Object.fromEntries(Object.entries(permissions).map(([key, value]) => [key, value === true])),
  };
}

export default async function handler(request: any, response: any) {
  const method = String(request.method || "GET").toUpperCase();
  const token = parseCookie(firstHeader(request.headers?.cookie))[STAFF_COOKIE_NAME];

  try {
    if (method === "GET") {
      const staff = readStaffSession(token);
      return send(response, 200, { authenticated: Boolean(staff), staff });
    }

    if (method !== "POST") {
      response.setHeader("Allow", "GET, POST");
      return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "GET or POST is required." } });
    }

    if (!sameOrigin(request)) {
      await recordSecurityEvent({ request, eventType: "staff_origin_rejected", eventStatus: "blocked", riskLevel: "high" }).catch(() => undefined);
      return send(response, 403, { error: { code: "ORIGIN_REJECTED", message: "This request was rejected." } });
    }

    const input = await readJsonBody<{ action?: string; username?: string; password?: string; pin?: string }>(request);
    const action = String(input.action || "");

    if (action === "logout") {
      response.setHeader("Set-Cookie", clearStaffSessionCookie());
      await recordSecurityEvent({ request, eventType: "staff_logout", eventStatus: "success", riskLevel: "info", subject: readStaffSession(token)?.employeeId || null }).catch(() => undefined);
      return send(response, 200, { authenticated: false, staff: null });
    }

    if (action !== "login") {
      return send(response, 400, { error: { code: "INVALID_ACTION", message: "That staff session action is not supported." } });
    }

    const username = String(input.username || "").trim();
    const password = input.password == null ? "" : String(input.password);
    const pin = input.pin == null ? "" : String(input.pin).trim();
    if (!username || username.length > 120 || (!password && !pin) || password.length > 128 || pin.length > 20) {
      return send(response, 400, { error: { code: "INVALID_STAFF_CREDENTIALS", message: "Enter a valid username and password or PIN." } });
    }

    const subject = `${requestIp(request)}:${username.toLowerCase()}`;
    await enforceDurableRateLimit({ request, action: "staff_login_identity", subject, limit: 10, windowSeconds: 900 });

    const baseUrl = configuredPos();
    const requestFetch = createHardenedServerFetch({ timeoutMs: 7000, maxResponseBytes: 256_000 });
    const upstream = await requestFetch(`${baseUrl}/api/employees/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ username, ...(password ? { password } : { pin }) }),
    });
    const payload = await upstream.json().catch(() => null);

    if (!upstream.ok) {
      await recordSecurityEvent({ request, eventType: "staff_login_failed", eventStatus: "invalid_credentials", riskLevel: "high", subject: username }).catch(() => undefined);
      return send(response, 401, { error: { code: "INVALID_STAFF_CREDENTIALS", message: "Username, password or PIN is incorrect." } });
    }

    const employee = sessionEmployee(payload);
    if (!employee.employeeId || !employee.username) {
      return send(response, 502, { error: { code: "INVALID_POS_STAFF_RESPONSE", message: "The POS did not return a valid employee identity." } });
    }

    const issued = issueStaffSession(employee);
    response.setHeader("Set-Cookie", staffSessionCookie(issued.token, issued.session.expiresAt));
    await recordSecurityEvent({ request, eventType: "staff_login_succeeded", eventStatus: "success", riskLevel: "info", subject: employee.employeeId, metadata: { securityGroupId: employee.securityGroupId || null, defaultBranchId: employee.defaultBranchId || null } }).catch(() => undefined);
    return send(response, 200, { authenticated: true, staff: issued.session });
  } catch (error) {
    const status = Number((error as any)?.status || 500);
    if (status === 429) {
      const retryAfter = Math.max(1, Number((error as any)?.retryAfterSeconds || 900));
      response.setHeader("Retry-After", String(retryAfter));
      return send(response, 429, { error: { code: "RATE_LIMITED", message: "Too many staff login attempts. Try again later." } });
    }
    if (status === 413) return send(response, 413, { error: { code: "REQUEST_TOO_LARGE", message: "The request is too large." } });
    const code = error instanceof Error ? error.message : "STAFF_SESSION_ERROR";
    console.error("staff_session_error", { code });
    return send(response, 503, {
      error: {
        code: code === "POS_NOT_CONFIGURED" || code === "STAFF_SESSION_SECRET_NOT_CONFIGURED" ? code : "STAFF_SESSION_UNAVAILABLE",
        message: "Staff sign-in is temporarily unavailable.",
        retryable: true,
      },
    });
  }
}
