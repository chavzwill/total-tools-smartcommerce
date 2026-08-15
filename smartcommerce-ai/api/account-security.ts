import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";

const COOKIE_NAME = "sc_session";
const MAX_BODY_BYTES = 16_000;
const WINDOW_MS = 15 * 60 * 1000;
const VERIFY_TTL_MS = 1000 * 60 * 60 * 24;
const RESET_TTL_MS = 1000 * 60 * 30;
const scrypt = promisify(scryptCallback);

type Bucket = { count: number; resetAt: number };
type CustomerRow = { id: string; email: string; full_name: string; email_verified: boolean };

const buckets = new Map<string, Bucket>();
let sqlClient: ReturnType<typeof neon> | undefined;

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

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

function hashValue(value?: string) {
  return value ? createHash("sha256").update(value.slice(0, 512)).digest("hex") : null;
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

function clientIp(request: any) {
  const forwarded = firstHeader(request.headers?.["x-forwarded-for"]);
  return forwarded?.split(",")[0]?.trim() || request.socket?.remoteAddress || "unknown";
}

function enforceRateLimit(request: any, action: string, limit: number) {
  const key = `${action}:${clientIp(request)}`;
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  if (current.count >= limit) {
    const error = new Error("RATE_LIMITED") as Error & { status?: number };
    error.status = 429;
    throw error;
  }
  current.count += 1;
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

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function passwordAllowed(value: string) {
  return value.length >= 10 && value.length <= 128;
}

async function passwordHash(password: string) {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

async function currentCustomer(sessionToken?: string) {
  if (!sessionToken) return undefined;
  const rows = (await sql()`
    SELECT c.id, c.email, c.full_name, c.email_verified
    FROM customer_sessions s
    JOIN customer_accounts c ON c.id = s.customer_id
    WHERE s.token_hash = ${hashToken(sessionToken)}
      AND s.revoked_at IS NULL
      AND s.expires_at > NOW()
    LIMIT 1
  `) as CustomerRow[];
  return rows[0];
}

async function customerByEmail(email: string) {
  const rows = (await sql()`
    SELECT id, email, full_name, email_verified
    FROM customer_accounts
    WHERE email = ${email}
    LIMIT 1
  `) as CustomerRow[];
  return rows[0];
}

async function issueToken(customerId: string, purpose: "email_verification" | "password_reset", request: any) {
  const db = sql();
  const raw = randomBytes(32).toString("base64url");
  const id = `sec_${randomBytes(16).toString("hex")}`;
  const now = new Date();
  const ttl = purpose === "email_verification" ? VERIFY_TTL_MS : RESET_TTL_MS;
  const expiresAt = new Date(now.getTime() + ttl).toISOString();

  await db`
    UPDATE customer_security_tokens
    SET consumed_at = NOW()
    WHERE customer_id = ${customerId}
      AND purpose = ${purpose}
      AND consumed_at IS NULL
  `;
  await db`
    INSERT INTO customer_security_tokens
      (id, customer_id, purpose, token_hash, created_at, expires_at, consumed_at, request_ip_hash, user_agent_hash)
    VALUES
      (${id}, ${customerId}, ${purpose}, ${hashToken(raw)}, ${now.toISOString()}, ${expiresAt}, NULL,
       ${hashValue(clientIp(request))}, ${hashValue(firstHeader(request.headers?.["user-agent"]))})
  `;
  return { raw, id };
}

function canonicalAppUrl() {
  const raw = String(process.env.SMARTCOMMERCE_APP_URL || "").trim();
  if (!raw) throw new Error("EMAIL_DELIVERY_NOT_CONFIGURED");
  const parsed = new URL(raw);
  if (parsed.protocol !== "https:") throw new Error("EMAIL_DELIVERY_NOT_CONFIGURED");
  return parsed.toString().replace(/\/$/, "");
}

function emailConfig() {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = String(process.env.SMARTCOMMERCE_EMAIL_FROM || "").trim();
  if (!apiKey || !from) throw new Error("EMAIL_DELIVERY_NOT_CONFIGURED");
  return { apiKey, from };
}

async function sendSecurityEmail(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
}) {
  const { apiKey, from } = emailConfig();
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "SmartCommerce/1.0",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({ from, to: [input.to], subject: input.subject, text: input.text, html: input.html }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("EMAIL_DELIVERY_FAILED");
}

async function sendVerification(customer: CustomerRow, request: any) {
  const token = await issueToken(customer.id, "email_verification", request);
  const url = `${canonicalAppUrl()}/#/account?verify=${encodeURIComponent(token.raw)}`;
  await sendSecurityEmail({
    to: customer.email,
    subject: "Verify your SmartCommerce email",
    text: `Verify your SmartCommerce email by opening this link: ${url}\n\nThis link expires in 24 hours.`,
    html: `<p>Verify your SmartCommerce email.</p><p><a href="${url}">Verify email</a></p><p>This link expires in 24 hours.</p>`,
    idempotencyKey: `verify-${token.id}`,
  });
}

async function sendPasswordReset(customer: CustomerRow, request: any) {
  const token = await issueToken(customer.id, "password_reset", request);
  const url = `${canonicalAppUrl()}/#/account?reset=${encodeURIComponent(token.raw)}`;
  await sendSecurityEmail({
    to: customer.email,
    subject: "Reset your SmartCommerce password",
    text: `Reset your SmartCommerce password by opening this link: ${url}\n\nThis link expires in 30 minutes. If you did not request this, you can ignore this email.`,
    html: `<p>Reset your SmartCommerce password.</p><p><a href="${url}">Reset password</a></p><p>This link expires in 30 minutes. If you did not request this, you can ignore this email.</p>`,
    idempotencyKey: `reset-${token.id}`,
  });
}

async function consumeVerification(rawToken: string) {
  const rows = (await sql()`
    WITH consumed AS (
      UPDATE customer_security_tokens
      SET consumed_at = NOW()
      WHERE token_hash = ${hashToken(rawToken)}
        AND purpose = 'email_verification'
        AND consumed_at IS NULL
        AND expires_at > NOW()
      RETURNING customer_id
    )
    UPDATE customer_accounts
    SET email_verified = TRUE, updated_at = NOW()
    WHERE id IN (SELECT customer_id FROM consumed)
    RETURNING id
  `) as { id: string }[];
  return Boolean(rows[0]);
}

async function consumePasswordReset(rawToken: string, newPassword: string) {
  const storedPassword = await passwordHash(newPassword);
  const rows = (await sql()`
    WITH consumed AS (
      UPDATE customer_security_tokens
      SET consumed_at = NOW()
      WHERE token_hash = ${hashToken(rawToken)}
        AND purpose = 'password_reset'
        AND consumed_at IS NULL
        AND expires_at > NOW()
      RETURNING customer_id
    ), updated AS (
      UPDATE customer_accounts
      SET password_hash = ${storedPassword}, updated_at = NOW()
      WHERE id IN (SELECT customer_id FROM consumed)
      RETURNING id
    ), revoked AS (
      UPDATE customer_sessions
      SET revoked_at = NOW()
      WHERE customer_id IN (SELECT id FROM updated)
        AND revoked_at IS NULL
      RETURNING id
    )
    SELECT id FROM updated LIMIT 1
  `) as { id: string }[];
  return Boolean(rows[0]);
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
    return send(response, 403, { error: { code: "ORIGIN_REJECTED", message: "This request was rejected." } });
  }

  try {
    const input = await readJsonBody<{ action?: string; email?: string; token?: string; password?: string }>(request);
    const action = String(input.action || "");
    const sessionToken = parseCookie(firstHeader(request.headers?.cookie))[COOKIE_NAME];

    if (action === "request_verification") {
      enforceRateLimit(request, action, 5);
      const customer = await currentCustomer(sessionToken);
      if (!customer) return send(response, 401, { error: { code: "AUTH_REQUIRED", message: "Sign in to verify your email." } });
      if (customer.email_verified) return send(response, 200, { ok: true, alreadyVerified: true });
      await sendVerification(customer, request);
      return send(response, 202, { ok: true, message: "Verification email sent." });
    }

    if (action === "verify_email") {
      enforceRateLimit(request, action, 12);
      const rawToken = String(input.token || "");
      if (rawToken.length < 32 || rawToken.length > 128) {
        return send(response, 400, { error: { code: "INVALID_TOKEN", message: "That verification link is invalid or expired." } });
      }
      const verified = await consumeVerification(rawToken);
      if (!verified) return send(response, 400, { error: { code: "INVALID_TOKEN", message: "That verification link is invalid or expired." } });
      return send(response, 200, { ok: true, verified: true });
    }

    if (action === "request_password_reset") {
      enforceRateLimit(request, action, 5);
      const email = String(input.email || "").trim().toLowerCase();
      if (validEmail(email)) {
        const customer = await customerByEmail(email);
        if (customer) {
          try { await sendPasswordReset(customer, request); }
          catch (error) { console.error("password_reset_delivery_failed", { code: "delivery_failed" }); }
        }
      }
      return send(response, 202, { ok: true, message: "If that account exists, a reset link will be sent." });
    }

    if (action === "reset_password") {
      enforceRateLimit(request, action, 8);
      const rawToken = String(input.token || "");
      const password = String(input.password || "");
      if (rawToken.length < 32 || rawToken.length > 128 || !passwordAllowed(password)) {
        return send(response, 400, { error: { code: "INVALID_RESET", message: "That reset link is invalid or expired, or the new password does not meet requirements." } });
      }
      const changed = await consumePasswordReset(rawToken, password);
      if (!changed) return send(response, 400, { error: { code: "INVALID_RESET", message: "That reset link is invalid or expired." } });
      return send(response, 200, { ok: true, passwordReset: true });
    }

    return send(response, 400, { error: { code: "INVALID_ACTION", message: "That security action is not supported." } });
  } catch (error) {
    if (error instanceof SyntaxError) return send(response, 400, { error: { code: "INVALID_JSON", message: "The request body is invalid." } });
    const status = Number((error as { status?: number })?.status || 500);
    if (status === 429) {
      response.setHeader("Retry-After", "900");
      return send(response, 429, { error: { code: "RATE_LIMITED", message: "Too many attempts. Try again later." } });
    }
    if (status === 413) return send(response, 413, { error: { code: "REQUEST_TOO_LARGE", message: "The request is too large." } });
    const code = error instanceof Error && error.message === "EMAIL_DELIVERY_NOT_CONFIGURED" ? "EMAIL_NOT_CONFIGURED" : "SECURITY_SERVICE_UNAVAILABLE";
    console.error("customer_security_error", { code: code.toLowerCase() });
    return send(response, 503, { error: { code, message: "Account security services are temporarily unavailable.", retryable: true } });
  }
}
