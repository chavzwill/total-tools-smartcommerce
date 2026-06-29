import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createPlatformBackendService } from "./src/backend/platformBackendService";
import { handlePlatformRestRequest } from "./src/backend/platformRestApi";
const unsupported = (operation) => ({
    success: false,
    error: {
        code: "PLATFORM_ADAPTER_UNSUPPORTED",
        message: `${operation} is not supported by the configured platform adapter.`,
        retryable: false,
    },
});
const unsupportedAdapter = {
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
    handleWebhook: async (context) => unsupported(`Webhook handling for provider ${context.providerId}`),
};
const firstHeader = (value) => Array.isArray(value) ? value[0] : value;
const resolvePlatformContext = (request) => ({
    businessAccountId: request.headers.get("x-business-account-id") ||
        process.env.SMARTCOMMERCE_BUSINESS_ACCOUNT_ID ||
        "",
    providerId: request.headers.get("x-provider-id") ||
        process.env.SMARTCOMMERCE_PROVIDER_ID ||
        "unsupported",
    connectionId: request.headers.get("x-connection-id") || undefined,
    actorId: request.headers.get("x-actor-id") || undefined,
    requestId: request.headers.get("x-request-id") || crypto.randomUUID(),
    locale: request.headers.get("accept-language") || undefined,
    timezone: request.headers.get("x-timezone") || undefined,
});
const platformBackendService = createPlatformBackendService({
    adapter: unsupportedAdapter,
    resolveContext: resolvePlatformContext,
});
const readRequestBody = async (request) => {
    const chunks = [];
    for await (const chunk of request) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
};
const toFetchRequest = async (request) => {
    const headers = new Headers();
    Object.entries(request.headers).forEach(([key, value]) => {
        const headerValue = firstHeader(value);
        if (headerValue !== undefined)
            headers.set(key, headerValue);
    });
    const method = request.method || "GET";
    const url = `http://${headers.get("host") || "localhost"}${request.url || "/"}`;
    const body = method === "GET" || method === "HEAD"
        ? undefined
        : await readRequestBody(request);
    return new Request(url, { method, headers, body });
};
const sendFetchResponse = async (serverResponse, response) => {
    serverResponse.statusCode = response.status;
    response.headers.forEach((value, key) => {
        serverResponse.setHeader(key, value);
    });
    serverResponse.end(Buffer.from(await response.arrayBuffer()));
};
const isPlatformRoute = (url) => !!url &&
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
                server.middlewares.use(async (request, response, next) => {
                    if (!isPlatformRoute(request.url))
                        return next();
                    try {
                        const platformRequest = await toFetchRequest(request);
                        const platformResponse = await handlePlatformRestRequest(platformRequest, platformBackendService);
                        await sendFetchResponse(response, platformResponse);
                    }
                    catch (error) {
                        await sendFetchResponse(response, new Response(JSON.stringify({
                            success: false,
                            error: {
                                code: "PLATFORM_REST_ROUTER_ERROR",
                                message: "The platform REST router failed to handle the request.",
                                details: error instanceof Error
                                    ? { name: error.name, message: error.message }
                                    : error,
                                retryable: false,
                            },
                        }), {
                            status: 500,
                            headers: { "Content-Type": "application/json" },
                        }));
                    }
                });
            },
        },
        react(),
    ],
});
