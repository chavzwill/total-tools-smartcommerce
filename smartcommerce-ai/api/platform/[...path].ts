import { timingSafeEqual } from "node:crypto";
import { handlePlatformRestRequest } from "../../src/backend/platformRestApi.js";
import { createConfiguredTotalToolsPlatformService } from "../../src/integrations/totalToolsPlatformRuntime.js";
import { executeIdempotentPlatformWrite } from "../../src/server/platformIdempotency.js";

const service = createConfiguredTotalToolsPlatformService();
const MAX_BODY_BYTES = 64 * 1024;
const INTERNAL_TOKEN_ENV = "SMARTCOMMERCE_PLATFORM_INTERNAL_TOKEN";

const firstHeader = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const safeEqual = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

const requestPath = (request: any) => {
  try {
    return new URL(String(request.url || "/"), "https://smartcommerce.local").pathname;
  } catch {
    return "/";
  }
};

const isPublicPlatformPath = (method: string, path: string) => {
  if (method === "POST" && path === "/api/platform/assistant") return true;
  if (method !== "GET") return false;
  if (
    path === "/api/platform/integrations/health" ||
    path === "/api/platform/branches" ||
    path === "/api/platform/categories" ||
    path === "/api/platform/inventory/availability" ||
    path === "/api/platform/products" ||
    path === "/api/platform/rentals" ||
    path === "/api/platform/rentals/assets" ||
    path === "/api/platform/rentals/availability" ||
    path === "/api/platform/repairs/catalog"
  ) {
    return true;
  }
  if (/^\/api\/platform\/products\/[^/]+$/.test(path)) return true;
  if (/^\/api\/platform\/rentals\/assets\/[^/]+$/.test(path)) return true;
  return false;
};

const idempotentOperation = (method: string, path: string) => {
  if (method !== "POST") return undefined;
  if (path === "/api/platform/orders") return { operation: "platform.order.create", keyHeader: "idempotency-key" };
  if (path === "/api/platform/invoices") return { operation: "platform.invoice.create", keyHeader: "idempotency-key" };
  if (path === "/api/platform/checkout") return { operation: "platform.checkout.create", keyHeader: "idempotency-key" };
  if (path === "/api/platform/integrations/webhooks") return { operation: "platform.webhook.process", keyHeader: "x-provider-event-id" };
  return undefined;
};

const internalAuthorization = (request: any) => {
  const configured = process.env[INTERNAL_TOKEN_ENV]?.trim() || "";
  if (!configured) return { configured: false, authorized: false };
  const raw = firstHeader(request.headers?.authorization)?.trim() || "";
  const prefix = "Bearer ";
  if (!raw.startsWith(prefix)) return { configured: true, authorized: false };
  const supplied = raw.slice(prefix.length).trim();
  return {
    configured: true,
    authorized: supplied.length > 0 && safeEqual(supplied, configured),
  };
};

const readBody = async (request: AsyncIterable<unknown>) => {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    if (chunk === undefined || chunk === null) continue;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    total += buffer.length;
    if (total > MAX_BODY_BYTES) {
      const error = new Error("PLATFORM_REQUEST_TOO_LARGE") as Error & { status?: number };
      error.status = 413;
      throw error;
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
};

const toRequest = async (request: any, privileged: boolean) => {
  const headers = new Headers();
  Object.entries(request.headers || {}).forEach(([key, value]) => {
    const normalized = key.toLowerCase();
    if (normalized === "authorization" || normalized === "host" || normalized === "x-forwarded-host") return;
    if (
      !privileged &&
      (
        normalized === "x-actor-id" ||
        normalized === "x-connection-id" ||
        normalized === "x-business-account-id" ||
        normalized === "x-provider-id"
      )
    ) return;
    const headerValue = firstHeader(value as string | string[] | undefined);
    if (headerValue !== undefined) headers.set(key, headerValue);
  });

  const trustedBusinessAccountId = process.env.SMARTCOMMERCE_BUSINESS_ACCOUNT_ID?.trim();
  const trustedProviderId = process.env.SMARTCOMMERCE_PROVIDER_ID?.trim();
  if (trustedBusinessAccountId) headers.set("x-business-account-id", trustedBusinessAccountId);
  if (trustedProviderId) headers.set("x-provider-id", trustedProviderId);

  const method = String(request.method || "GET").toUpperCase();
  const rawPath = String(request.url || "/api/platform");
  const url = new URL(rawPath, "https://smartcommerce.internal").toString();
  const body = method === "GET" || method === "HEAD" ? undefined : await readBody(request);

  return new Request(url, {
    method,
    headers,
    body,
  });
};

const sendJson = (response: any, status: number, payload: unknown) => {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");
  response.end(JSON.stringify(payload));
};

const sendResponse = async (response: any, platformResponse: Response) => {
  response.statusCode = platformResponse.status;
  platformResponse.headers.forEach((value, key) => response.setHeader(key, value));
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(Buffer.from(await platformResponse.arrayBuffer()));
};

export default async function handler(request: any, response: any) {
  const method = String(request.method || "GET").toUpperCase();
  const path = requestPath(request);
  const publicPath = isPublicPlatformPath(method, path);
  const authorization = internalAuthorization(request);

  if (!publicPath) {
    if (!authorization.configured) {
      return sendJson(response, 503, {
        success: false,
        error: {
          code: "PLATFORM_GATEWAY_NOT_CONFIGURED",
          message: "Protected platform operations are unavailable until the internal gateway credential is configured.",
          retryable: false,
        },
      });
    }
    if (!authorization.authorized) {
      return sendJson(response, 401, {
        success: false,
        error: {
          code: "PLATFORM_AUTH_REQUIRED",
          message: "This platform operation requires trusted server authorization.",
          retryable: false,
        },
      });
    }
  }

  try {
    const platformRequest = await toRequest(request, authorization.authorized);
    const protectedWrite = idempotentOperation(method, path);
    const platformResponse = protectedWrite
      ? await executeIdempotentPlatformWrite({
          request: platformRequest,
          operation: protectedWrite.operation,
          keyHeader: protectedWrite.keyHeader,
          ttlHours: path === "/api/platform/integrations/webhooks" ? 72 : 24,
          execute: () => handlePlatformRestRequest(platformRequest.clone(), service),
        })
      : await handlePlatformRestRequest(platformRequest, service);
    await sendResponse(response, platformResponse);
  } catch (error) {
    if (Number((error as any)?.status) === 413) {
      return sendJson(response, 413, {
        success: false,
        error: {
          code: "PLATFORM_REQUEST_TOO_LARGE",
          message: "The platform request body exceeds the allowed size.",
          retryable: false,
        },
      });
    }
    console.error("platform_gateway_error", {
      code: "PLATFORM_SERVERLESS_ERROR",
      path,
      method,
    });
    return sendJson(response, 500, {
      success: false,
      error: {
        code: "PLATFORM_SERVERLESS_ERROR",
        message: "The SmartCommerce platform API failed to process the request.",
        retryable: false,
      },
    });
  }
}
