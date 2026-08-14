import {
  runGroundedCommerceAssistant,
  type CommerceAssistantRequest,
} from "../src/backend/commerceAssistantEngine";
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
  return new Request(`${proto}://${host}${request.url || "/api/commerce-assistant"}`, {
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
    enforceBurstLimit(request, "commerce-assistant", 30);
    const input = await readJsonBody<CommerceAssistantRequest>(request, 32_000);

    if (typeof input.prompt !== "string") {
      throw new RequestGuardError(400, "ASSISTANT_PROMPT_REQUIRED", "Tell SmartCommerce what you need help with.");
    }
    const prompt = input.prompt.trim();
    if (!prompt) {
      throw new RequestGuardError(400, "ASSISTANT_PROMPT_REQUIRED", "Tell SmartCommerce what you need help with.");
    }
    if (prompt.length > 4_000) {
      throw new RequestGuardError(413, "ASSISTANT_PROMPT_TOO_LONG", "That request is too long. Please shorten it and try again.");
    }
    if (input.branchId !== undefined && (typeof input.branchId !== "string" || input.branchId.length > 128)) {
      throw new RequestGuardError(400, "INVALID_BRANCH_ID", "The branch identifier is invalid.");
    }
    if (input.customerId !== undefined && (typeof input.customerId !== "string" || input.customerId.length > 128)) {
      throw new RequestGuardError(400, "INVALID_CUSTOMER_ID", "The customer identifier is invalid.");
    }

    const context = resolveTotalToolsPlatformContext(toWebRequest(request, id));
    if (!context.businessAccountId || !context.providerId) {
      throw new RequestGuardError(401, "PLATFORM_CONTEXT_REQUIRED", "SmartCommerce AI requires configured business and provider context.");
    }

    const result = await runGroundedCommerceAssistant(
      createConfiguredTotalToolsAdapter(),
      context,
      { ...input, prompt }
    );

    logAiEvent("commerce_assistant_complete", {
      requestId: id,
      success: result.success,
      durationMs: Date.now() - started,
      productCount: result.success ? result.data.recommendedProducts.length : 0,
      rentalCount: result.success ? result.data.recommendedRentals.length : 0,
      errorCode: result.success ? undefined : result.error.code,
    });

    if (result.success) {
      response.statusCode = 200;
      response.end(JSON.stringify({ ...result, requestId: result.requestId || id }));
      return;
    }

    response.statusCode = result.error.retryable ? 503 : 422;
    response.end(JSON.stringify({
      success: false,
      requestId: id,
      error: {
        code: result.error.code,
        message: result.error.retryable
          ? "SmartCommerce AI is temporarily unavailable. Please try again shortly."
          : "SmartCommerce AI could not complete that request reliably.",
        retryable: Boolean(result.error.retryable),
      },
    }));
  } catch (error) {
    if (sendGuardError(response, error, id)) return;

    logAiEvent("commerce_assistant_error", {
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
        code: "COMMERCE_ASSISTANT_SERVER_ERROR",
        message: "SmartCommerce AI could not complete this request.",
        retryable: true,
      },
    }));
  }
}
