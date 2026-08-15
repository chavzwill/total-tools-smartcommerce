import { timingSafeEqual } from "node:crypto";
import { firstHeader } from "../src/server/securityInfrastructure.js";
import { runSecurityOperationsMonitor } from "../src/server/securityOperations.js";

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
