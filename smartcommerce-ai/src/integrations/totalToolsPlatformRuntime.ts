import { createPlatformBackendService } from "../backend/platformBackendService.js";
import { buildGroundedProductComparison } from "../backend/assistantComparisonEngine.js";
import { runGroundedAssistantIntelligence } from "../backend/assistantIntelligenceEngine.js";
import type { PlatformApiResult, PlatformSyncResult } from "../platform/contracts";
import type { PosAdapter, PosAdapterContext } from "../platform/posAdapter";
import { createHardenedServerFetch, validateServerIntegrationBaseUrl } from "../server/hardenedOutboundFetch.js";
import { createTotalToolsPosReadAdapter } from "./totalToolsPosReadAdapter.js";

const unsupported = <T>(operation: string): PlatformApiResult<T> => ({
  success: false,
  error: {
    code: "PLATFORM_ADAPTER_UNSUPPORTED",
    message: `${operation} is not supported by the configured platform adapter.`,
    retryable: false,
  },
});

export const unsupportedPlatformAdapter: PosAdapter = {
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
    unsupported<PlatformSyncResult>(`Webhook handling for provider ${context.providerId}`),
};

export const createConfiguredTotalToolsAdapter = (): PosAdapter => {
  const configuredBaseUrl = process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_URL?.trim();
  if (!configuredBaseUrl) return unsupportedPlatformAdapter;

  let baseUrl: string;
  try {
    baseUrl = validateServerIntegrationBaseUrl(configuredBaseUrl).toString().replace(/\/$/, "");
  } catch {
    console.error("total_tools_pos_configuration_rejected", { code: "unsafe_pos_endpoint" });
    return unsupportedPlatformAdapter;
  }

  return createTotalToolsPosReadAdapter({
    baseUrl,
    apiKey: process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_API_KEY?.trim() || undefined,
    apiKeyHeader:
      process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_API_KEY_HEADER?.trim() ||
      "X-API-Key",
    defaultCurrency:
      process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_CURRENCY?.trim() || "JMD",
    fetchImpl: createHardenedServerFetch({ timeoutMs: 7000, maxResponseBytes: 2_000_000 }),
  });
};

export const resolveTotalToolsPlatformContext = (request: Request): PosAdapterContext => ({
  businessAccountId:
    request.headers.get("x-business-account-id") ||
    process.env.SMARTCOMMERCE_BUSINESS_ACCOUNT_ID ||
    "",
  providerId:
    request.headers.get("x-provider-id") ||
    process.env.SMARTCOMMERCE_PROVIDER_ID ||
    (process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_URL ? "total-tools-pos" : "unsupported"),
  connectionId: request.headers.get("x-connection-id") || undefined,
  actorId: request.headers.get("x-actor-id") || undefined,
  requestId: request.headers.get("x-request-id") || crypto.randomUUID(),
  locale: request.headers.get("accept-language") || undefined,
  timezone: request.headers.get("x-timezone") || undefined,
});

function assistantSummary(input: {
  job: string;
  needsClarification: boolean;
  clarificationQuestion: string;
  productCount: number;
  rentalCount: number;
  warnings: string[];
}) {
  if (input.needsClarification && input.productCount === 0 && input.rentalCount === 0) {
    return input.clarificationQuestion || "Tell me a little more about the job so I can narrow this down accurately.";
  }

  if (input.productCount || input.rentalCount) {
    const parts = [
      input.productCount ? `${input.productCount} product${input.productCount === 1 ? "" : "s"}` : "",
      input.rentalCount ? `${input.rentalCount} rental option${input.rentalCount === 1 ? "" : "s"}` : "",
    ].filter(Boolean);
    const warning = input.warnings[0] ? ` ${input.warnings[0]}` : "";
    return `I matched ${input.job || "your request"} against the connected Total Tools catalogue and found ${parts.join(" and ")}.${warning}`;
  }

  return input.warnings[0] || "I understood the request, but the connected catalogue does not currently contain a grounded match. Try another description or Product Match if you have a photo.";
}

function followUps(intent: string, hasRecommendations: boolean, needsClarification: boolean) {
  if (needsClarification && !hasRecommendations) return [];
  if (intent === "rent") return ["Show me cheaper rental options", "Compare these rentals", "What can I buy instead?"];
  if (intent === "repair") return ["Show me replacement options", "Can I rent one while mine is repaired?", "What information does the repair team need?"];
  if (intent === "identify") return ["I can describe what is visible", "Help me narrow down the product type"];
  if (intent === "commercial") return ["Show me bulk-friendly options", "Compare these products", "Help me prepare a commercial quote"];
  return ["Show me cheaper options", "Compare these products", "Can I rent instead?"];
}

export const createConfiguredTotalToolsPlatformService = () => {
  const adapter = createConfiguredTotalToolsAdapter();
  const service = createPlatformBackendService({
    adapter,
    resolveContext: resolveTotalToolsPlatformContext,
  });

  service.runAssistant = async (request, input) => {
    const context = resolveTotalToolsPlatformContext(request);
    const grounded = await runGroundedAssistantIntelligence(adapter, context, {
      prompt: input.prompt,
      branchId: input.branchId,
      history: input.history,
    });

    const hasRecommendations = grounded.products.length > 0 || grounded.rentals.length > 0;
    const comparison = grounded.understanding.intent === "compare"
      ? await buildGroundedProductComparison(adapter, context, grounded.products, input.branchId)
      : undefined;

    return {
      success: true,
      data: {
        response: comparison || assistantSummary({
          job: grounded.understanding.job,
          needsClarification: grounded.understanding.needsClarification,
          clarificationQuestion: grounded.understanding.clarificationQuestion,
          productCount: grounded.products.length,
          rentalCount: grounded.rentals.length,
          warnings: grounded.warnings,
        }),
        recommendedProducts: grounded.products,
        recommendedRentals: grounded.rentals,
        nextActions: followUps(grounded.understanding.intent, hasRecommendations, grounded.understanding.needsClarification),
      },
    };
  };

  return service;
};