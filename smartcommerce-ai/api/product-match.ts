import { runGroundedProductMatch, type ProductMatchRequest } from "../src/backend/productMatchEngine";
import {
  createConfiguredTotalToolsAdapter,
  resolveTotalToolsPlatformContext,
} from "../src/integrations/totalToolsPlatformRuntime";
import {
  RequestGuardError,
  enforceBurstLimit,
  logAiEvent,
  readJsonBody,
  requestId,
  sendGuardError,
} from "./_lib/aiRequestGuard";

const firstHeader = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const toWebRequest = (request: any, id: string) => {
  const headers = new Headers();
  Object.entries(request.headers || {}).forEach(([key, value]) => {
    const headerValue = firstHeader(value as string | string[] | undefined);
    if (headerValue !== undefined) headers.set(key, headerValue);
  });
  headers.set("x-request-id", id);
  const host = headers.get("host") || "localhost";
  const proto = headers.get("x-forwarded-proto") || "https";
  return new Request(`${proto}://${host}${request.url || "/api/product-match"}`, {
    method: String(request.method || "POST").toUpperCase(),
    headers,
  });
};

export default async function handler(request: any, response: any) {
  const id = requestId(request);
  const started = Date.now();
  response.setHeader("Content-Type", "application/json");
  response.setHeader("X-Request-Id", id);

  if (String(request.method || "GET").toUpperCase() !== "POST") {
    response.statusCode = 405;
    response.setHeader("Allow", "POST");
    response.end(JSON.stringify({ success: false, requestId: id, error: { code: "METHOD_NOT_ALLOWED", message: "POST is required." } }));
    return;
  }

  try {
    enforceBurstLimit(request, "product-match", 8);
    const input = await readJsonBody<ProductMatchRequest>(request, 4_000_000);

    if (typeof input.imageDataUrl !== "string" || !input.imageDataUrl.startsWith("data:image/")) {
      throw new RequestGuardError(400, "IMAGE_REQUIRED", "A valid image is required for Product Match.");
    }
    if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(input.imageDataUrl)) {
      throw new RequestGuardError(415, "IMAGE_TYPE_UNSUPPORTED", "Product Match supports JPEG, PNG, and WebP images.");
    }
    if (input.imageDataUrl.length > 3_500_000) {
      throw new RequestGuardError(413, "IMAGE_TOO_LARGE", "The prepared image is too large. Use a smaller image and retry.");
    }
    if (input.branchId !== undefined && (typeof input.branchId !== "string" || input.branchId.length > 128)) {
      throw new RequestGuardError(400, "INVALID_BRANCH_ID", "The branch identifier is invalid.");
    }

    const context = resolveTotalToolsPlatformContext(toWebRequest(request, id));
    if (!context.businessAccountId || !context.providerId) {
      throw new RequestGuardError(401, "PLATFORM_CONTEXT_REQUIRED", "Product Match requires configured business and provider context.");
    }

    const result = await runGroundedProductMatch(
      createConfiguredTotalToolsAdapter(),
      context,
      input
    );

    logAiEvent("product_match_complete", {
      requestId: id,
      success: result.success,
      durationMs: Date.now() - started,
      candidateCount: result.success ? result.data.candidates.length : 0,
      needsClarification: result.success ? result.data.needsClarification : undefined,
      errorCode: result.success ? undefined : result.error.code,
    });

    response.statusCode = result.success ? 200 : result.error.retryable ? 503 : 422;
    response.end(JSON.stringify({ ...result, requestId: result.requestId || id }));
  } catch (error) {
    if (sendGuardError(response, error, id)) return;

    logAiEvent("product_match_error", {
      requestId: id,
      success: false,
      durationMs: Date.now() - started,
      errorName: error instanceof Error ? error.name : "unknown",
    });

    response.statusCode = 500;
    response.end(JSON.stringify({
      success: false,
      requestId: id,
      error: {
        code: "PRODUCT_MATCH_SERVER_ERROR",
        message: "Product Match could not complete this request.",
        retryable: true,
      },
    }));
  }
}
