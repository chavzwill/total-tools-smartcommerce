import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createPlatformBackendService } from "./src/backend/platformBackendService.js";
import { handlePlatformRestRequest } from "./src/backend/platformRestApi.js";
import { createTotalToolsPosReadAdapter } from "./src/integrations/totalToolsPosReadAdapter.js";
import type {
  PlatformApiResult,
  PlatformSyncResult,
  PosAdapter,
  PosAdapterContext,
} from "./src/platform/index.js";

const DEV_PLATFORM_MAX_BODY_BYTES = 64 * 1024;

const unsupported = <T,>(operation: string): PlatformApiResult<T> => ({
  success: false,
  error: {
    code: "PLATFORM_ADAPTER_UNSUPPORTED",
    message: `${operation} is not supported by the configured platform adapter.`,
    retryable: false,
  },
});

const unsupportedAdapter: PosAdapter = {
  healthCheck: async () => unsupported("Platform health check"),
  listBranches: async () => unsupported("Branch listing"),
  listCategories: async () => unsupported("Category listing"),
  searchProducts: async () => unsupported("Product search"),
  getProductById: async () => unsupported("Product lookup"),
  getInventoryAvailability: async () => unsupported("Inventory availability"),
  listRentalAssets: async () => unsupported("Rental asset listing"),
  getRentalAssetById: async () => unsupported("Rental asset lookup"),
  getRentalAvailability: async () => unsupported("Rental availability"),
  createRentalReservation: async () => unsupported("Rental reservation creation"),
  createRepairRequest: async () => unsupported("Repair request creation"),
  getRepairJobById: async () => unsupported("Repair job lookup"),
  createCommercialQuote: async () => unsupported("Commercial quote creation"),
  createCustomer: async () => unsupported("Customer creation"),
  getCustomerById: async () => unsupported("Customer lookup"),
  createOrder: async () => unsupported("Order creation"),
  getOrderById: async () => unsupported("Order lookup"),
  createInvoice: async () => unsupported("Invoice creation"),
  handleWebhook: async (context) =>
    unsupported<PlatformSyncResult>(
      `Webhook handling for provider ${context.providerId}`
    ),
};

const createConfiguredAdapter = (): PosAdapter => {
  const baseUrl = process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_URL?.trim();
  if (!baseUrl) return unsupportedAdapter;

  return createTotalToolsPosReadAdapter({
    baseUrl,
    apiKey: process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_API_KEY?.trim() || undefined,
    apiKeyHeader:
      process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_API_KEY_HEADER?.trim() ||
      "X-API-Key",
    defaultCurrency:
      process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_CURRENCY?.trim() || "JMD",
  });
};

const firstHeader = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const resolvePlatformContext = (request: Request): PosAdapterContext => ({
  businessAccountId: process.env.SMARTCOMMERCE_BUSINESS_ACCOUNT_ID || "",
  providerId:
    process.env.SMARTCOMMERCE_PROVIDER_ID ||
    (process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_URL ? "total-tools-pos" : "unsupported"),
  requestId: request.headers.get("x-request-id") || crypto.randomUUID(),
  locale: request.headers.get("accept-language") || undefined,
  timezone: request.headers.get("x-timezone") || undefined,
});

const platformBackendService = createPlatformBackendService({
  adapter: createConfiguredAdapter(),
  resolveContext: resolvePlatformContext,
});

const readRequestBody = async (
  request: IncomingMessage,
  maxBodyBytes = DEV_PLATFORM_MAX_BODY_BYTES
) => {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBodyBytes) {
      const error = new Error("PLATFORM_REQUEST_TOO_LARGE") as Error & {
        status?: number;
      };
      error.status = 413;
      throw error;
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
};

const toFetchRequest = async (request: IncomingMessage) => {
  const headers = new Headers();

  Object.entries(request.headers).forEach(([key, value]) => {
    const headerValue = firstHeader(value);
    if (headerValue !== undefined) headers.set(key, headerValue);
  });

  const method = request.method || "GET";
  const url = `http://${headers.get("host") || "localhost"}${request.url || "/"}`;
  const body =
    method === "GET" || method === "HEAD"
      ? undefined
      : await readRequestBody(request);

  return new Request(url, { method, headers, body });
};

const sendFetchResponse = async (
  serverResponse: ServerResponse,
  response: Response
) => {
  serverResponse.statusCode = response.status;
  response.headers.forEach((value, key) => {
    serverResponse.setHeader(key, value);
  });
  serverResponse.end(Buffer.from(await response.arrayBuffer()));
};

const isPlatformRoute = (url?: string) =>
  !!url &&
  (url.startsWith("/platform/") ||
    url === "/platform" ||
    url.startsWith("/api/platform/") ||
    url === "/api/platform" ||
    url.startsWith("/api/v1/platform/") ||
    url === "/api/v1/platform");

export default defineConfig({
  plugins: [
    {
      name: "smartcommerce-platform-rest",
      configureServer(server) {
        // Load server-only values for the same handlers used in deployment.
        // Vite exposes only VITE_* values to browser modules.
        const environment = loadEnv(server.config.mode, server.config.envDir, "");
        for (const [key, value] of Object.entries(environment)) {
          if (process.env[key] === undefined) process.env[key] = value;
        }
          const accountRoutes = new Set([
            "checkout-payment", "handypay-webhook",
            "courier-dispatch", "staff-dispatch",
          "courier-deliveries", "customer-deliveries", "staff-deliveries", "courier-private", "courier-review", "courier-account", "couriers", "courier-approvals", "staff-session", "account", "account-security", "account-sessions", "account-step-up",
          "account-mfa", "account-passkeys", "commerce", "commercial-account",
          "commercial-accounting", "commercial-financial-policy",
        ]);
        server.middlewares.use(async (request, response, next) => {
          const url = new URL(request.url || "/", "http://localhost");
          const name = url.pathname.replace(/^\/api\//, "");
          if (!url.pathname.startsWith("/api/") || !accountRoutes.has(name)) return next();
          try {
            const module = await server.ssrLoadModule(`/api/${name}.ts`);
            Object.assign(request, { query: Object.fromEntries(url.searchParams) });
            await module.default(request, response);
          } catch {
            if (response.writableEnded) return;
            response.statusCode = 503;
            response.setHeader("Content-Type", "application/json");
            response.setHeader("Cache-Control", "no-store");
            response.end(JSON.stringify({ error: { code: "ACCOUNT_SERVICE_UNAVAILABLE", message: "Account services are unavailable. Please try again later." } }));
          }
        });
        server.middlewares.use(async (request, response, next) => {
          if (!isPlatformRoute(request.url)) return next();

          try {
            const platformRequest = await toFetchRequest(request);
            const platformResponse = await handlePlatformRestRequest(
              platformRequest,
              platformBackendService
            );
            await sendFetchResponse(response, platformResponse);
          } catch (error) {
            const tooLarge =
              Number((error as { status?: number })?.status) === 413 ||
              (error as Error)?.message === "PLATFORM_REQUEST_TOO_LARGE";
            await sendFetchResponse(
              response,
              new Response(
                JSON.stringify({
                  success: false,
                  error: tooLarge
                    ? {
                        code: "PLATFORM_REQUEST_TOO_LARGE",
                        message: "The platform request body is too large.",
                        retryable: false,
                      }
                    : {
                        code: "PLATFORM_REST_ROUTER_ERROR",
                        message: "The platform REST router failed to handle the request.",
                        retryable: false,
                      },
                }),
                {
                  status: tooLarge ? 413 : 500,
                  headers: {
                    "Content-Type": "application/json",
                    "Cache-Control": "no-store",
                    "X-Content-Type-Options": "nosniff",
                  },
                }
              )
            );
          }
        });
      },
    },
    react(),
  ],
});
