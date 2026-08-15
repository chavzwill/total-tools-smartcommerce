import { neon } from "@neondatabase/serverless";
import { createHash, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import {
  enforceDurableRateLimit,
  firstHeader,
  recordSecurityEvent,
  requestIp,
} from "../src/server/securityInfrastructure.js";

const COOKIE_NAME = "sc_session";
const MAX_BODY_BYTES = 8_000;
const STEP_UP_TTL_MS = 10 * 60 * 1000;
const scrypt = promisify(scryptCallback);
let sqlClient: ReturnType<typeof neon> | undefined;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("CUSTOMER_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function parseCookie(header?: string) {
  const result: Record<string, string> = {};
  for (const part of (header || "").split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try { result[key] = decodeURIComponent(value); } catch { result[key] = value; }
  }
  return result;
}

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
      const error = new Error("BODY_TOO_LARGE") as Error & { status?: number };
      error.status = 413;
      throw error;
    }
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as T;
}

async function passwordMatches(password: string, stored: string) {
  const [algorithm, saltEncoded, hashEncoded] = stored.split("$");
  if (algorithm !== "scrypt" || !saltEncoded || !hashEncoded) return false;
  const salt = Buffer.from(saltEncoded, "base64url");
  const expected = Buffer.from(hashEncoded, "base64url");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function sessionIdentity(token: string) {
  const rows = await sql()`
    SELECT s.id AS session_id, s.customer_id, c.password_hash
    FROM customer_sessions s
    JOIN customer_accounts c ON c.id = s.customer_id
    WHERE s.token_hash = ${hashToken(token)}
      AND s.revoked_at IS NULL
      AND s.expires_at > NOW()
    LIMIT 1
  ` as Array<{ session_id: string; customer_id: string; password_hash: string | null }>;
  return rows[0];
}

function send(response: any, status: number, payload: unknown) {
  response.statusCode = status;
  response.end(JSON.stringify(payload));
}

export default async function handler(request: any, response: any) {
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");

  if (String(request.method || "").toUpperCase() !== "POST") {
    response.setHeader("Allow", "POST");
    return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "POST is required." } });
  }
  if (!sameOrigin(request)) {
    await recordSecurityEvent({ request, eventType: "step_up_origin_rejected", eventStatus: "blocked", riskLevel: "medium" }).catch(() => undefined);
    return send(response, 403, { error: { code: "ORIGIN_REJECTED", message: "This request was rejected." } });
  }

  try {
    const token = parseCookie(firstHeader(request.headers?.cookie))[COOKIE_NAME];
    if (!token) return send(response, 401, { error: { code: "AUTH_REQUIRED", message: "Sign in before confirming a sensitive action." } });
    const identity = await sessionIdentity(token);
    if (!identity?.password_hash) return send(response, 401, { error: { code: "AUTH_REQUIRED", message: "Sign in before confirming a sensitive action." } });

    const input = await readJsonBody<{ password?: string; purpose?: string }>(request);
    const password = String(input.password || "");
    const purpose = String(input.purpose || "sensitive_action").slice(0, 120);

    await enforceDurableRateLimit({ request, action: "step_up_ip", subject: requestIp(request), limit: 30 });
    await enforceDurableRateLimit({ request, action: "step_up_session", subject: identity.session_id, limit: 8 });

    if (!password || password.length > 128 || !(await passwordMatches(password, identity.password_hash))) {
      await recordSecurityEvent({
        request,
        eventType: "step_up_failed",
        eventStatus: "invalid_credentials",
        riskLevel: "high",
        customerId: identity.customer_id,
        sessionId: identity.session_id,
        metadata: { purpose },
      });
      return send(response, 401, { error: { code: "STEP_UP_FAILED", message: "Your password could not be confirmed." } });
    }

    const expiresAt = new Date(Date.now() + STEP_UP_TTL_MS).toISOString();
    await sql()`
      UPDATE customer_sessions
      SET last_authenticated_at = NOW(),
          last_activity_at = NOW(),
          step_up_expires_at = ${expiresAt}
      WHERE id = ${identity.session_id}
        AND revoked_at IS NULL
    `;
    await recordSecurityEvent({
      request,
      eventType: "step_up_succeeded",
      eventStatus: "password_reauthenticated",
      riskLevel: "medium",
      customerId: identity.customer_id,
      sessionId: identity.session_id,
      metadata: { purpose, expiresAt, method: "password_reauth" },
    });

    return send(response, 200, {
      ok: true,
      stepUp: {
        method: "password_reauth",
        expiresAt,
      },
    });
  } catch (error) {
    const status = Number((error as any)?.status || 500);
    if (status === 429) {
      const retryAfter = Math.max(1, Number((error as any)?.retryAfterSeconds || 900));
      response.setHeader("Retry-After", String(retryAfter));
      await recordSecurityEvent({ request, eventType: "step_up_rate_limited", eventStatus: "blocked", riskLevel: "high" }).catch(() => undefined);
      return send(response, 429, { error: { code: "RATE_LIMITED", message: "Too many attempts. Try again later." } });
    }
    if (status === 413) return send(response, 413, { error: { code: "REQUEST_TOO_LARGE", message: "The request is too large." } });
    console.error("account_step_up_error", { code: "step_up_request_failed" });
    return send(response, 503, { error: { code: "STEP_UP_UNAVAILABLE", message: "Sensitive-action confirmation is temporarily unavailable.", retryable: true } });
  }
}
