import {
  runGroundedCommerceAssistant,
  type CommerceAssistantRequest,
} from "../src/backend/commerceAssistantEngine";
import {
  createConfiguredTotalToolsAdapter,
  resolveTotalToolsPlatformContext,
} from "../src/integrations/totalToolsPlatformRuntime";

const firstHeader = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const readBody = async (request: AsyncIterable<unknown>) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    if (chunk === undefined || chunk === null) continue;
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8");
};

const toWebRequest = (request: any) => {
  const headers = new Headers();
  Object.entries(request.headers || {}).forEach(([key, value]) => {
    const headerValue = firstHeader(value as string | string[] | undefined);
    if (headerValue !== undefined) headers.set(key, headerValue);
  });
  const host = headers.get("host") || "localhost";
  const proto = headers.get("x-forwarded-proto") || "https";
  return new Request(`${proto}://${host}${request.url || "/api/commerce-assistant"}`, {
    method: String(request.method || "POST").toUpperCase(),
    headers,
  });
};

export default async function handler(request: any, response: any) {
  response.setHeader("Content-Type", "application/json");

  if (String(request.method || "GET").toUpperCase() !== "POST") {
    response.statusCode = 405;
    response.end(JSON.stringify({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "POST is required." } }));
    return;
  }

  try {
    const input = JSON.parse((await readBody(request)) || "{}") as CommerceAssistantRequest;
    const webRequest = toWebRequest(request);
    const context = resolveTotalToolsPlatformContext(webRequest);

    if (!context.businessAccountId || !context.providerId) {
      response.statusCode = 401;
      response.end(JSON.stringify({ success: false, error: { code: "PLATFORM_CONTEXT_REQUIRED", message: "SmartCommerce AI requires configured business and provider context." } }));
      return;
    }

    const result = await runGroundedCommerceAssistant(
      createConfiguredTotalToolsAdapter(),
      context,
      input
    );
    response.statusCode = result.success ? 200 : 503;
    response.end(JSON.stringify(result));
  } catch (error) {
    response.statusCode = 500;
    response.end(JSON.stringify({
      success: false,
      error: {
        code: "COMMERCE_ASSISTANT_SERVER_ERROR",
        message: error instanceof Error ? error.message : "SmartCommerce AI failed.",
      },
    }));
  }
}
