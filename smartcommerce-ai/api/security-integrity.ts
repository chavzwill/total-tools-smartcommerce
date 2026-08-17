import { timingSafeEqual } from "node:crypto";
import {
  enforceDurableRateLimit,
  firstHeader,
  recordSecurityEvent,
  requestIp,
  verifySecurityEventIntegrity,
} from "../src/server/securityInfrastructure.js";

const INTERNAL_TOKEN_ENV = "SMARTCOMMERCE_PLATFORM_INTERNAL_TOKEN";
const INTEGRITY_PROBE_LIMIT = 30;

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorized(request: any) {
  const configured = process.env[INTERNAL_TOKEN_ENV]?.trim() || "";
  if (!configured) return { configured: false, allowed: false };
  const raw = firstHeader(request.headers?.authorization)?.trim() || "";
  if (!raw.startsWith("Bearer ")) return { configured: true, allowed: false };
  const supplied = raw.slice("Bearer ".length).trim();
  return {
    configured: true,
    allowed: supplied.length > 0 && safeEqual(supplied, configured),
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
    return send(response, 405, {
      error: { code: "METHOD_NOT_ALLOWED", message: "GET is required." },
    });
  }

  try {
    await enforceDurableRateLimit({
      request,
      action: "security_integrity_probe_ip",
      subject: requestIp(request),
      limit: INTEGRITY_PROBE_LIMIT,
      windowSeconds: 300,
    });
  } catch (error) {
    if (Number((error as any)?.status) === 429 || (error instanceof Error && error.message === "RATE_LIMITED")) {
      const retryAfter = Math.max(1, Number((error as any)?.retryAfterSeconds || 60));
      response.setHeader("Retry-After", String(retryAfter));
      await recordSecurityEvent({
        request,
        eventType: "security_integrity_probe_blocked",
        eventStatus: "rate_limited",
        riskLevel: "medium",
        metadata: { retryAfterSeconds: retryAfter },
      }).catch(() => undefined);
      return send(response, 429, {
        error: {
          code: "RATE_LIMITED",
          message: "Too many integrity verification requests. Try again later.",
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
        code: "SECURITY_INTEGRITY_ENDPOINT_NOT_CONFIGURED",
        message: "Security integrity verification is unavailable until the internal gateway credential is configured.",
      },
    });
  }
  if (!auth.allowed) {
    await recordSecurityEvent({
      request,
      eventType: "security_integrity_auth_rejected",
      eventStatus: "blocked",
      riskLevel: "medium",
    }).catch(() => undefined);
    return send(response, 401, {
      error: { code: "SECURITY_INTEGRITY_AUTH_REQUIRED", message: "Trusted server authorization is required." },
    });
  }

  try {
    const result = await verifySecurityEventIntegrity();
    if (!result.configured) {
      return send(response, 503, {
        ok: false,
        integrity: { configured: false, valid: false, code: result.code },
      });
    }
    if (!result.valid) {
      console.error("security_audit_integrity_failed", {
        code: result.code,
        checkedEvents: result.checkedEvents,
      });
      await recordSecurityEvent({
        request,
        eventType: "security_audit_integrity_failed",
        eventStatus: "integrity_failure",
        riskLevel: "critical",
        metadata: { code: result.code, checkedEvents: result.checkedEvents },
      }).catch(() => undefined);
      return send(response, 409, {
        ok: false,
        integrity: {
          configured: true,
          valid: false,
          code: result.code,
          checkedEvents: result.checkedEvents,
        },
      });
    }

    return send(response, 200, {
      ok: true,
      integrity: {
        configured: true,
        valid: true,
        code: result.code,
        checkedEvents: result.checkedEvents,
      },
    });
  } catch {
    console.error("security_audit_integrity_check_failed", { code: "integrity_check_error" });
    return send(response, 503, {
      error: {
        code: "SECURITY_INTEGRITY_CHECK_UNAVAILABLE",
        message: "Security integrity verification is temporarily unavailable.",
      },
    });
  }
}
