import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import { handlePlatformRestRequest } from "../src/backend/platformRestApi.js";
import { createConfiguredTotalToolsPlatformService } from "../src/integrations/totalToolsPlatformRuntime.js";
import {
  enforceDurableRateLimit,
  firstHeader,
  recordSecurityEvent,
  requestIp,
} from "../src/server/securityInfrastructure.js";

const service = createConfiguredTotalToolsPlatformService();
const COOKIE_NAME = "sc_session";
const MAX_BODY_BYTES = 16 * 1024;
const ASSISTANT_RATE_LIMIT = 30;
const ASSISTANT_RATE_WINDOW_SECONDS = 300;

let sqlClient: ReturnType<typeof neon> | undefined;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) return undefined;
    sqlClient = neon(url);
  }
  return sqlClient;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
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

async function authenticatedCustomerId(request: any) {
  const token = parseCookie(firstHeader(request.headers?.cookie))[COOKIE_NAME];
  const db = sql();
  if (!token || !db) return undefined;
  const rows = await db`
    SELECT customer_id
    FROM customer_sessions
    WHERE token_hash = ${hashToken(token)}
      AND revoked_at IS NULL
      AND expires_at > NOW()
    LIMIT 1
  ` as Array<{ customer_id: string }>;
  return rows[0]?.customer_id;
}

function sameOrigin(request: any) {
  const origin = firstHeader(request.headers?.origin);
  if (!origin) return true;
  const host = firstHeader(request.headers?.host);
  if (!host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

async function readJsonBody(request: AsyncIterable<unknown>) {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    if (chunk === undefined || chunk === null) continue;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    total += buffer.length;
    if (total > MAX_BODY_BYTES) {
      const error = new Error("ASSISTANT_REQUEST_TOO_LARGE") as Error & { status?: number };
      error.status = 413;
      throw error;
    }
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<string, unknown>;
}

function sendJson(response: any, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");
  response.end(JSON.stringify(payload));
}

function trustedPlatformRequest(request: any, body: Record<string, unknown>, customerId?: string) {
  const headers = new Headers();
  const configuredBusinessAccountId = process.env.SMARTCOMMERCE_BUSINESS_ACCOUNT_ID?.trim() || "public-catalog";
  const configuredProviderId = process.env.SMARTCOMMERCE_PROVIDER_ID?.trim() ||
    (process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_URL ? "total-tools-pos" : "public-unsupported");

  headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");
  headers.set("x-business-account-id", configuredBusinessAccountId);
  headers.set("x-provider-id", configuredProviderId);
  const requestId = firstHeader(request.headers?.["x-request-id"]);
  if (requestId) headers.set("x-request-id", requestId);
  if (customerId) headers.set("x-actor-id", customerId);

  const sanitized = {
    ...body,
    ...(customerId ? { customerId } : {}),
  };
  if (!customerId) delete (sanitized as Record<string, unknown>).customerId;

  return new Request("https://smartcommerce.internal/api/platform/assistant", {
    method: "POST",
    headers,
    body: JSON.stringify(sanitized),
  });
}

export default async function handler(request: any, response: any) {
  const method = String(request.method || "GET").toUpperCase();
  if (method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, {
      success: false,
      error: { code: "METHOD_NOT_ALLOWED", message: "POST is required.", retryable: false },
    });
  }

  if (!sameOrigin(request)) {
    await recordSecurityEvent({
      request,
      eventType: "assistant_origin_rejected",
      eventStatus: "blocked",
      riskLevel: "medium",
    }).catch(() => undefined);
    return sendJson(response, 403, {
      success: false,
      error: { code: "ORIGIN_REJECTED", message: "This assistant request was rejected.", retryable: false },
    });
  }

  try {
    await enforceDurableRateLimit({
      request,
      action: "assistant_ip",
      subject: requestIp(request),
      limit: ASSISTANT_RATE_LIMIT,
      windowSeconds: ASSISTANT_RATE_WINDOW_SECONDS,
    });

    const body = await readJsonBody(request);
    const customerId = await authenticatedCustomerId(request);
    const platformResponse = await handlePlatformRestRequest(
      trustedPlatformRequest(request, body, customerId),
      service,
    );

    response.statusCode = platformResponse.status;
    platformResponse.headers.forEach((value, key) => response.setHeader(key, value));
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.end(Buffer.from(await platformResponse.arrayBuffer()));
  } catch (error) {
    if (Number((error as { status?: number })?.status) === 413) {
      return sendJson(response, 413, {
        success: false,
        error: { code: "ASSISTANT_REQUEST_TOO_LARGE", message: "The assistant request body exceeds the allowed size.", retryable: false },
      });
    }
    if (Number((error as { status?: number })?.status) === 429 || (error as Error)?.message === "RATE_LIMITED") {
      const retryAfter = Math.max(1, Number((error as { retryAfterSeconds?: number })?.retryAfterSeconds || ASSISTANT_RATE_WINDOW_SECONDS));
      response.setHeader("Retry-After", String(retryAfter));
      return sendJson(response, 429, {
        success: false,
        error: { code: "RATE_LIMITED", message: "Too many assistant requests. Please wait and try again.", retryable: true, retryAfterSeconds: retryAfter },
      });
    }
    if (error instanceof SyntaxError) {
      return sendJson(response, 400, {
        success: false,
        error: { code: "INVALID_JSON", message: "The assistant request body is invalid.", retryable: false },
      });
    }
    console.error("assistant_gateway_error", { code: "ASSISTANT_SERVERLESS_ERROR" });
    return sendJson(response, 500, {
      success: false,
      error: { code: "ASSISTANT_SERVERLESS_ERROR", message: "SmartCommerce could not process the assistant request.", retryable: false },
    });
  }
}
