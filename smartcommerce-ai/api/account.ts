import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import {
  enforceDurableRateLimit,
  firstHeader,
  recordSecurityEvent,
  requestIp,
  requestUserAgent,
  securityHash,
  touchSessionSecurity,
} from "../src/server/securityInfrastructure.js";

const COOKIE_NAME = "sc_session";
const MAX_BODY_BYTES = 16_000;
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const scrypt = promisify(scryptCallback);

type CustomerAccount = {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
};

type AccountRow = {
  id: string;
  email: string;
  password_hash?: string;
  full_name: string;
  phone: string | null;
  email_verified: boolean;
  created_at: string | Date;
  updated_at: string | Date;
};

let sqlClient: ReturnType<typeof neon> | undefined;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("CUSTOMER_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

function toIso(value: string | Date) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function accountFromRow(row: AccountRow): CustomerAccount {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone || undefined,
    emailVerified: Boolean(row.email_verified),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

async function passwordHash(password: string) {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

async function passwordMatches(password: string, stored: string) {
  const [algorithm, saltEncoded, hashEncoded] = stored.split("$");
  if (algorithm !== "scrypt" || !saltEncoded || !hashEncoded) return false;
  const salt = Buffer.from(saltEncoded, "base64url");
  const expected = Buffer.from(hashEncoded, "base64url");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createAccount(input: { email: string; password: string; fullName: string; phone?: string }) {
  const db = sql();
  const existing = (await db`SELECT id FROM customer_accounts WHERE email = ${input.email} LIMIT 1`) as Record<string, unknown>[];
  if (existing.length) return undefined;

  const id = `cus_${randomBytes(16).toString("hex")}`;
  const now = new Date().toISOString();
  const storedPassword = await passwordHash(input.password);
  const rows = (await db`
    INSERT INTO customer_accounts (id, email, password_hash, full_name, phone, email_verified, created_at, updated_at)
    VALUES (${id}, ${input.email}, ${storedPassword}, ${input.fullName}, ${input.phone || null}, false, ${now}, ${now})
    RETURNING id, email, full_name, phone, email_verified, created_at, updated_at
  `) as AccountRow[];
  return rows[0] ? accountFromRow(rows[0]) : undefined;
}

export async function authenticate(email: string, password: string) {
  const rows = (await sql()`
    SELECT id, email, password_hash, full_name, phone, email_verified, created_at, updated_at
    FROM customer_accounts
    WHERE email = ${email}
    LIMIT 1
  `) as AccountRow[];
  const row = rows[0];
  if (!row?.password_hash) {
    await scrypt(password, Buffer.alloc(16), 64);
    return undefined;
  }
  return (await passwordMatches(password, row.password_hash)) ? accountFromRow(row) : undefined;
}

async function createSession(customer: CustomerAccount, request: any) {
  const token = randomBytes(32).toString("base64url");
  const sessionId = `ses_${randomBytes(16).toString("hex")}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  const tokenHash = hashToken(token);
  await sql()`
    INSERT INTO customer_sessions (
      id, customer_id, token_hash, created_at, expires_at, revoked_at,
      user_agent_hash, auth_level, last_authenticated_at, last_activity_at, ip_hash
    ) VALUES (
      ${sessionId}, ${customer.id}, ${tokenHash}, ${now.toISOString()}, ${expiresAt}, NULL,
      ${securityHash(requestUserAgent(request))}, 'password', ${now.toISOString()}, ${now.toISOString()},
      ${securityHash(requestIp(request))}
    )
  `;
  return { token, tokenHash, sessionId, expiresAt };
}

async function sessionCustomer(token?: string) {
  if (!token) return undefined;
  const rows = (await sql()`
    SELECT c.id, c.email, c.full_name, c.phone, c.email_verified, c.created_at, c.updated_at
    FROM customer_sessions s
    JOIN customer_accounts c ON c.id = s.customer_id
    WHERE s.token_hash = ${hashToken(token)}
      AND s.revoked_at IS NULL
      AND s.expires_at > NOW()
    LIMIT 1
  `) as AccountRow[];
  return rows[0] ? accountFromRow(rows[0]) : undefined;
}

async function revokeSession(token?: string) {
  if (!token) return;
  await sql()`
    UPDATE customer_sessions
    SET revoked_at = NOW()
    WHERE token_hash = ${hashToken(token)} AND revoked_at IS NULL
  `;
}

async function authRateLimits(request: any, action: "signup" | "login", email: string) {
  const ip = requestIp(request);
  if (action === "signup") {
    await enforceDurableRateLimit({ request, action: "signup_ip", subject: ip, limit: 20 });
    if (email) await enforceDurableRateLimit({ request, action: "signup_identity", subject: `${ip}:${email}`, limit: 5 });
    return;
  }
  await enforceDurableRateLimit({ request, action: "login_ip", subject: ip, limit: 40 });
  if (email) await enforceDurableRateLimit({ request, action: "login_identity", subject: `${ip}:${email}`, limit: 10 });
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

function sessionCookie(token: string, expiresAt: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${secure}; Expires=${new Date(expiresAt).toUTCString()}`;
}

function clearSessionCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=0`;
}

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function passwordAllowed(password: string) {
  return password.length >= 10 && password.length <= 128;
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

  const method = String(request.method || "GET").toUpperCase();
  const token = parseCookie(firstHeader(request.headers?.cookie))[COOKIE_NAME];

  try {
    if (method === "GET") {
      const customer = await sessionCustomer(token);
      if (customer && token) {
        await touchSessionSecurity({ tokenHash: hashToken(token), request });
      }
      return send(response, 200, { authenticated: Boolean(customer), customer: customer || null });
    }

    if (method !== "POST") {
      response.setHeader("Allow", "GET, POST");
      return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "GET or POST is required." } });
    }

    if (!sameOrigin(request)) {
      await recordSecurityEvent({ request, eventType: "account_origin_rejected", eventStatus: "blocked", riskLevel: "medium" });
      return send(response, 403, { error: { code: "ORIGIN_REJECTED", message: "This request was rejected." } });
    }

    const input = await readJsonBody<{ action?: string; email?: string; password?: string; fullName?: string; phone?: string }>(request);
    const action = String(input.action || "");

    if (action === "signup") {
      const email = String(input.email || "").trim().toLowerCase();
      await authRateLimits(request, "signup", email);
      const password = String(input.password || "");
      const fullName = String(input.fullName || "").trim();
      const phone = input.phone === undefined ? undefined : String(input.phone).trim();

      if (!validEmail(email) || !passwordAllowed(password) || fullName.length < 2 || fullName.length > 120 || (phone && phone.length > 40)) {
        await recordSecurityEvent({ request, eventType: "signup_rejected", eventStatus: "invalid_input", riskLevel: "low", subject: email || null });
        return send(response, 400, { error: { code: "INVALID_ACCOUNT_DETAILS", message: "Use a valid email, a password of at least 10 characters, and your full name." } });
      }

      const customer = await createAccount({ email, password, fullName, phone });
      if (!customer) {
        await recordSecurityEvent({ request, eventType: "signup_rejected", eventStatus: "account_exists_or_conflict", riskLevel: "low", subject: email });
        return send(response, 409, { error: { code: "ACCOUNT_NOT_CREATED", message: "An account could not be created with those details." } });
      }

      const session = await createSession(customer, request);
      await recordSecurityEvent({ request, eventType: "signup_succeeded", eventStatus: "success", riskLevel: "info", customerId: customer.id, sessionId: session.sessionId, subject: email });
      response.setHeader("Set-Cookie", sessionCookie(session.token, session.expiresAt));
      return send(response, 201, { authenticated: true, customer });
    }

    if (action === "login") {
      const email = String(input.email || "").trim().toLowerCase();
      await authRateLimits(request, "login", email);
      const password = String(input.password || "");
      if (!validEmail(email) || !password || password.length > 128) {
        await recordSecurityEvent({ request, eventType: "login_failed", eventStatus: "invalid_credentials", riskLevel: "medium", subject: email || null });
        return send(response, 401, { error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } });
      }

      const customer = await authenticate(email, password);
      if (!customer) {
        await recordSecurityEvent({ request, eventType: "login_failed", eventStatus: "invalid_credentials", riskLevel: "medium", subject: email });
        return send(response, 401, { error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } });
      }

      await revokeSession(token);
      const session = await createSession(customer, request);
      await recordSecurityEvent({ request, eventType: "login_succeeded", eventStatus: "success", riskLevel: "info", customerId: customer.id, sessionId: session.sessionId, subject: email });
      response.setHeader("Set-Cookie", sessionCookie(session.token, session.expiresAt));
      return send(response, 200, { authenticated: true, customer });
    }

    if (action === "logout") {
      const customer = await sessionCustomer(token);
      await revokeSession(token);
      await recordSecurityEvent({ request, eventType: "logout", eventStatus: "success", riskLevel: "info", customerId: customer?.id || null });
      response.setHeader("Set-Cookie", clearSessionCookie());
      return send(response, 200, { authenticated: false, customer: null });
    }

    return send(response, 400, { error: { code: "INVALID_ACTION", message: "That account action is not supported." } });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return send(response, 400, { error: { code: "INVALID_JSON", message: "The request body is invalid." } });
    }
    const status = Number((error as { status?: number })?.status || 500);
    if (status === 429) {
      const retryAfter = Math.max(1, Number((error as any)?.retryAfterSeconds || 900));
      response.setHeader("Retry-After", String(retryAfter));
      await recordSecurityEvent({ request, eventType: "auth_rate_limited", eventStatus: "blocked", riskLevel: "high" }).catch(() => undefined);
      return send(response, 429, { error: { code: "RATE_LIMITED", message: "Too many attempts. Try again later." } });
    }
    if (status === 413) {
      return send(response, 413, { error: { code: "REQUEST_TOO_LARGE", message: "The request is too large." } });
    }

    console.error("customer_account_error", {
      code: error instanceof Error && error.message === "CUSTOMER_DATABASE_NOT_CONFIGURED" ? "database_not_configured" : "account_request_failed",
    });
    return send(response, 503, {
      error: {
        code: "ACCOUNT_SERVICE_UNAVAILABLE",
        message: "Customer accounts are temporarily unavailable.",
        retryable: true,
      },
    });
  }
}
