import { runGroundedProductMatch, type ProductMatchRequest } from "../src/backend/productMatchEngine";
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

const toWebRequest = async (request: any) => {
  const headers = new Headers();
  Object.entries(request.headers || {}).forEach(([key, value]) => {
    const headerValue = firstHeader(value as string | string[] | undefined);
    if (headerValue !== undefined) headers.set(key, headerValue);
  });
  const host = headers.get("host") || "localhost";
  const proto = headers.get("x-forwarded-proto") || "https";
  return new Request(`${proto}://${host}${request.url || "/api/product-match"}`, {
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
    const bodyText = await readBody(request);
    const input = JSON.parse(bodyText || "{}") as ProductMatchRequest;
    if (!input.imageDataUrl || !input.imageDataUrl.startsWith("data:image/")) {
      response.statusCode = 400;
      response.end(JSON.stringify({ success: false, error: { code: "IMAGE_REQUIRED", message: "A valid image is required for Product Match." } }));
      return;
    }

    if (input.imageDataUrl.length > 3_500_000) {
      response.statusCode = 413;
      response.end(JSON.stringify({ success: false, error: { code: "IMAGE_TOO_LARGE", message: "The prepared image is too large. Use a smaller image and retry." } }));
      return;
    }

    const webRequest = await toWebRequest(request);
    const context = resolveTotalToolsPlatformContext(webRequest);
    if (!context.businessAccountId || !context.providerId) {
      response.statusCode = 401;
      response.end(JSON.stringify({ success: false, error: { code: "PLATFORM_CONTEXT_REQUIRED", message: "Product Match requires configured business and provider context." } }));
      return;
    }

    const result = await runGroundedProductMatch(
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
        code: "PRODUCT_MATCH_SERVER_ERROR",
        message: error instanceof Error ? error.message : "Product Match failed.",
      },
    }));
  }
}
