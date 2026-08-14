import { createPlatformBackendService } from "../backend/platformBackendService";
import type { PlatformApiResult, PlatformSyncResult } from "../platform/contracts";
import type { PosAdapter, PosAdapterContext } from "../platform/posAdapter";
import { createTotalToolsPosReadAdapter } from "./totalToolsPosReadAdapter";

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
  const baseUrl = process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_URL?.trim();
  if (!baseUrl) return unsupportedPlatformAdapter;

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

export const createConfiguredTotalToolsPlatformService = () =>
  createPlatformBackendService({
    adapter: createConfiguredTotalToolsAdapter(),
    resolveContext: resolveTotalToolsPlatformContext,
  });
