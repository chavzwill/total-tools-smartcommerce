import { timingSafeEqual } from "node:crypto";
import {
  enforceDurableRateLimit,
  firstHeader,
  recordSecurityEvent,
  requestIp,
} from "../src/server/securityInfrastructure.js";
import { runSecurityOperationsMonitor } from "../src/server/securityOperations.js";

const SECURITY_MONITOR_PROBE_LIMIT = 30;

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorized(request: any) {
  const configured = process.env.CRON_SECRET?.trim() || "";
  if (!configured) return { configured: false, allowed: false };
  const supplied = firstHeader(request.headers?.authorization)?.trim() || "";
  return {
    configured: true,
    allowed: safeEqual(supplied, `Bearer ${configured}`),
  };
}

function send(response: any, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.end(JSON.stringify(payload));
}

export default async function handler(request: any, response: any) {
  if (String(request.method || "GET").toUpperCase() !== "GET") {
    response.setHeader("Allow", "GET");
    return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "GET is required." } });
  }

  try {
    await enforceDurableRateLimit({
      request,
      action: "security_monitor_probe_ip",
      subject: requestIp(request),
      limit: SECURITY_MONITOR_PROBE_LIMIT,
      windowSeconds: 300,
    });
  } catch (error) {
    if (Number((error as any)?.status) === 429 || (error instanceof Error && error.message === "RATE_LIMITED")) {
      const retryAfter = Math.max(1, Number((error as any)?.retryAfterSeconds || 60));
      response.setHeader("Retry-After", String(retryAfter));
      await recordSecurityEvent({
        request,
        eventType: "security_monitor_probe_blocked",
        eventStatus: "rate_limited",
        riskLevel: "medium",
        metadata: { retryAfterSeconds: retryAfter },
      }).catch(() => undefined);
      return send(response, 429, {
        error: {
          code: "RATE_LIMITED",
          message: "Too many security monitor requests. Try again later.",
          retryAfterSeconds: retryAfter,
        },
      });
    }
    throw error;
  }

  const auth = authorized(request);
  if (!auth.configured) {
    return send(response, 503, {
      error: {
        code: "SECURITY_MONITOR_NOT_CONFIGURED",
        message: "Security monitoring is unavailable until the cron credential is configured.",
      },
    });
  }
  if (!auth.allowed) {
    await recordSecurityEvent({
      request,
      eventType: "security_monitor_auth_rejected",
      eventStatus: "blocked",
      riskLevel: "medium",
    }).catch(() => undefined);
    return send(response, 401, {
      error: { code: "SECURITY_MONITOR_AUTH_REQUIRED", message: "Scheduled monitor authorization is required." },
    });
  }

  try {
    const result = await runSecurityOperationsMonitor();
    return send(response, result.ok ? 200 : 409, result);
  } catch {
    console.error("security_monitor_failed", { code: "security_monitor_error" });
    return send(response, 503, {
      error: {
        code: "SECURITY_MONITOR_UNAVAILABLE",
        message: "Security monitoring is temporarily unavailable.",
      },
    });
  }
}
