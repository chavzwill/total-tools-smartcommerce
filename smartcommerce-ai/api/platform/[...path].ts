import { handlePlatformRestRequest } from "../../src/backend/platformRestApi";
import { createConfiguredTotalToolsPlatformService } from "../../src/integrations/totalToolsPlatformRuntime";

const service = createConfiguredTotalToolsPlatformService();

const firstHeader = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const readBody = async (request: AsyncIterable<unknown>) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    if (chunk === undefined || chunk === null) continue;
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks);
};

const toRequest = async (request: any) => {
  const headers = new Headers();
  Object.entries(request.headers || {}).forEach(([key, value]) => {
    const headerValue = firstHeader(value as string | string[] | undefined);
    if (headerValue !== undefined) headers.set(key, headerValue);
  });

  const method = String(request.method || "GET").toUpperCase();
  const host = headers.get("host") || "localhost";
  const forwardedProto = headers.get("x-forwarded-proto") || "https";
  const url = `${forwardedProto}://${host}${request.url || "/api/platform"}`;
  const body = method === "GET" || method === "HEAD" ? undefined : await readBody(request);

  return new Request(url, {
    method,
    headers,
    body,
  });
};

const sendResponse = async (response: any, platformResponse: Response) => {
  response.statusCode = platformResponse.status;
  platformResponse.headers.forEach((value, key) => response.setHeader(key, value));
  response.end(Buffer.from(await platformResponse.arrayBuffer()));
};

export default async function handler(request: any, response: any) {
  try {
    const platformRequest = await toRequest(request);
    const platformResponse = await handlePlatformRestRequest(platformRequest, service);
    await sendResponse(response, platformResponse);
  } catch (error) {
    response.statusCode = 500;
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify({
        success: false,
        error: {
          code: "PLATFORM_SERVERLESS_ERROR",
          message: "The SmartCommerce platform API failed to process the request.",
          details:
            error instanceof Error
              ? { name: error.name, message: error.message }
              : String(error),
          retryable: false,
        },
      })
    );
  }
}
