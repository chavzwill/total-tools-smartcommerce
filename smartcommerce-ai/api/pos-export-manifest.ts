import { timingSafeEqual } from "node:crypto";
import { buildSmartCommercePosExportManifest } from "../src/platform/posExportRegistry.js";

const INTERNAL_TOKEN_ENV = "SMARTCOMMERCE_PLATFORM_INTERNAL_TOKEN";

const firstHeader = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const safeEqual = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

const authorized = (request: any) => {
  const configured = process.env[INTERNAL_TOKEN_ENV]?.trim() || "";
  if (!configured) return { configured: false, authorized: false };
  const raw = firstHeader(request.headers?.authorization)?.trim() || "";
  if (!raw.startsWith("Bearer ")) return { configured: true, authorized: false };
  const supplied = raw.slice("Bearer ".length).trim();
  return {
    configured: true,
    authorized: supplied.length > 0 && safeEqual(supplied, configured),
  };
};

const send = (response: any, status: number, payload: unknown) => {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(payload));
};

export default async function handler(request: any, response: any) {
  if (String(request.method || "GET").toUpperCase() !== "GET") {
    response.setHeader("Allow", "GET");
    return send(response, 405, {
      success: false,
      error: { code: "METHOD_NOT_ALLOWED", message: "Only GET is supported." },
    });
  }

  const auth = authorized(request);
  if (!auth.configured) {
    return send(response, 503, {
      success: false,
      error: {
        code: "PLATFORM_GATEWAY_NOT_CONFIGURED",
        message: "POS exports are unavailable until the internal gateway credential is configured.",
      },
    });
  }
  if (!auth.authorized) {
    return send(response, 401, {
      success: false,
      error: { code: "PLATFORM_AUTH_REQUIRED", message: "Trusted server authorization is required." },
    });
  }

  const businessAccountId = process.env.SMARTCOMMERCE_BUSINESS_ACCOUNT_ID?.trim();
  const providerId = process.env.SMARTCOMMERCE_PROVIDER_ID?.trim() || "total-tools-pos";
  if (!businessAccountId) {
    return send(response, 503, {
      success: false,
      error: {
        code: "BUSINESS_CONTEXT_NOT_CONFIGURED",
        message: "SMARTCOMMERCE_BUSINESS_ACCOUNT_ID must be configured before POS exports can be advertised.",
      },
    });
  }

  return send(response, 200, {
    success: true,
    data: buildSmartCommercePosExportManifest({ businessAccountId, providerId }),
  });
}
