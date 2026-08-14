import {
  authenticateCustomer,
  createCustomerAccount,
  createCustomerSession,
  getCustomerBySessionToken,
  revokeCustomerSession,
} from "../src/backend/customerAuthStore";

const COOKIE_NAME = "sc_session";
const MAX_BODY_BYTES = 16_000;
const WINDOW_MS = 15 * 60 * 1000;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function clientKey(request: any, action: string) {
  const forwarded = firstHeader(request.headers?.["x-forwarded-for"]);
  const ip = forwarded?.split(",")[0]?.trim() || request.socket?.remoteAddress || "unknown";
  return `${action}:${ip}`;
}

function enforceRateLimit(request: any, action: string, limit: number) {
  const key = clientKey(request, action);
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
  const text = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(text || "{}") as T;
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

  const method = String(request.method || "GET").toUpperCase();
  const token = parseCookie(firstHeader(request.headers?.cookie))[COOKIE_NAME];

  try {
    if (method === "GET") {
      const customer = token ? await getCustomerBySessionToken(token) : undefined;
      return send(response, 200, { authenticated: Boolean(customer), customer: customer || null });
    }

    if (method !== "POST") {
      response.setHeader("Allow", "GET, POST");
      return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "GET or POST is required." } });
    }

    if (!sameOrigin(request)) {
      return send(response, 403, { error: { code: "ORIGIN_REJECTED", message: "This request was rejected." } });
    }

    const input = await readJsonBody<{ action?: string; email?: string; password?: string; fullName?: string; phone?: string }>(request);
    const action = String(input.action || "");

    if (action === "signup") {
      enforceRateLimit(request, "signup", 5);
      const email = String(input.email || "").trim().toLowerCase();
      const password = String(input.password || "");
      const fullName = String(input.fullName || "").trim();
      const phone = input.phone === undefined ? undefined : String(input.phone).trim();

      if (!validEmail(email) || !passwordAllowed(password) || fullName.length < 2 || fullName.length > 120 || (phone && phone.length > 40)) {
        return send(response, 400, {
          error: {
            code: "INVALID_ACCOUNT_DETAILS",
            message: "Use a valid email, a password of at least 10 characters, and your full name.",
          },
        });
      }

      const result = await createCustomerAccount({ email, password, fullName, phone });
      if (!result.created) {
        return send(response, 409, {
          error: { code: "ACCOUNT_NOT_CREATED", message: "An account could not be created with those details." },
        });
      }

      const session = await createCustomerSession(result.customer, firstHeader(request.headers?.["user-agent"]));
      response.setHeader("Set-Cookie", sessionCookie(session.token, session.expiresAt));
      return send(response, 201, { authenticated: true, customer: session.customer });
    }

    if (action === "login") {
      enforceRateLimit(request, "login", 10);
      const email = String(input.email || "").trim().toLowerCase();
      const password = String(input.password || "");
      if (!validEmail(email) || !password || password.length > 128) {
        return send(response, 401, { error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } });
      }

      const customer = await authenticateCustomer(email, password);
      if (!customer) {
        return send(response, 401, { error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } });
      }

      if (token) await revokeCustomerSession(token);
      const session = await createCustomerSession(customer, firstHeader(request.headers?.["user-agent"]));
      response.setHeader("Set-Cookie", sessionCookie(session.token, session.expiresAt));
      return send(response, 200, { authenticated: true, customer: session.customer });
    }

    if (action === "logout") {
      if (token) await revokeCustomerSession(token);
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
      response.setHeader("Retry-After", "900");
      return send(response, 429, { error: { code: "RATE_LIMITED", message: "Too many attempts. Try again later." } });
    }
    if (status === 413) {
      return send(response, 413, { error: { code: "REQUEST_TOO_LARGE", message: "The request is too large." } });
    }

    console.error("customer_account_error", {
      name: error instanceof Error ? error.name : "unknown",
      message: error instanceof Error && error.message.includes("database is not configured") ? "database_not_configured" : "account_request_failed",
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
