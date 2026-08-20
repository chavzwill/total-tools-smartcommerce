import { createPlatformBackendService } from "../backend/platformBackendService.js";
import { buildGroundedProductComparison } from "../backend/assistantComparisonEngine.js";
import { runGroundedAssistantIntelligence } from "../backend/assistantIntelligenceEngine.js";
import { buildRepairIntakeGuidance } from "../backend/assistantRepairGuidance.js";
import type { AssistantWorkflowHandoff } from "../backend/platformBackendTypes.js";
import type { PlatformApiResult, PlatformSyncResult } from "../platform/contracts";
import type { PosAdapter, PosAdapterContext } from "../platform/posAdapter";
import { createHardenedServerFetch, validateServerIntegrationBaseUrl } from "../server/hardenedOutboundFetch.js";
import { createPreviewCommerceAdapter, PREVIEW_BUSINESS_ID, PREVIEW_PROVIDER_ID, previewCatalogueEnabled } from "./previewCommerceAdapter.js";
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
  if (!configuredBaseUrl) {
    return previewCatalogueEnabled() ? createPreviewCommerceAdapter() : unsupportedPlatformAdapter;
  }

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

export const resolveTotalToolsPlatformContext = (request: Request): PosAdapterContext => {
  const preview = !process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_URL && previewCatalogueEnabled();
  return {
    businessAccountId:
      request.headers.get("x-business-account-id") ||
      process.env.SMARTCOMMERCE_BUSINESS_ACCOUNT_ID ||
      (preview ? PREVIEW_BUSINESS_ID : ""),
    providerId:
      request.headers.get("x-provider-id") ||
      process.env.SMARTCOMMERCE_PROVIDER_ID ||
      (process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_URL ? "total-tools-pos" : preview ? PREVIEW_PROVIDER_ID : "unsupported"),
    connectionId: request.headers.get("x-connection-id") || undefined,
    actorId: request.headers.get("x-actor-id") || undefined,
    requestId: request.headers.get("x-request-id") || crypto.randomUUID(),
    locale: request.headers.get("accept-language") || undefined,
    timezone: request.headers.get("x-timezone") || undefined,
  };
};

function assistantSummary(input: {
  job: string;
  needsClarification: boolean;
  clarificationQuestion: string;
  productCount: number;
  rentalCount: number;
  warnings: string[];
  previewMode?: boolean;
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
    const source = input.previewMode ? "SmartCommerce preview catalogue" : "connected Total Tools catalogue";
    const verification = input.previewMode ? " Preview catalogue prices and items are for evaluation; live branch stock and availability still require the connected Total Tools provider." : "";
    return `I matched ${input.job || "your request"} against the ${source} and found ${parts.join(" and ")}.${warning}${verification}`;
  }

  if (input.previewMode) {
    return "I understood the request, but the SmartCommerce preview catalogue does not contain a grounded match. Try another description or Product Match if you have a photo. Live Total Tools inventory is not connected in this preview.";
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

function hasTimingHint(value: string) {
  return /\b(today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend|week|month|from\s+\d|until\s+\d|\d{4}-\d{2}-\d{2}|\d{1,2}[\/-]\d{1,2})\b/i.test(value);
}

function workflowHandoff(input: {
  intent: string;
  job: string;
  productName?: string;
  rentalAssetId?: string;
  branchId?: string;
  customerId?: string;
  quantity?: number;
}): AssistantWorkflowHandoff | undefined {
  const signedIn = Boolean(input.customerId);
  const branchKnown = Boolean(input.branchId);

  if (input.intent === "rent") {
    const assetKnown = Boolean(input.rentalAssetId);
    const timingMentioned = hasTimingHint(input.job);
    const knownFields = [
      assetKnown ? "grounded rental item" : "",
      branchKnown ? "selected shopping branch" : "",
      signedIn ? "signed-in customer account" : "",
      timingMentioned ? "requested timing mentioned" : "",
      input.quantity ? `quantity ${input.quantity}` : "",
    ].filter(Boolean);
    const missingFields = [
      assetKnown ? "" : "rental item",
      timingMentioned ? "confirm exact start and end dates" : "rental start and end dates",
      signedIn ? "" : "customer account",
      "provider rental eligibility verification",
    ].filter(Boolean);

    return {
      kind: "rental",
      label: assetKnown ? "Check dates & rental eligibility" : "Continue to rentals",
      href: assetKnown
        ? `/rental/${encodeURIComponent(String(input.rentalAssetId))}`
        : "/rentals",
      readiness: assetKnown && signedIn && timingMentioned ? "verification_required" : "needs_input",
      requiresMoreInput: true,
      knownFields,
      missingFields,
      verificationNote: "Signing in does not mean the rental is approved. Machine status, exact schedule, account standing and any provider eligibility requirements must still be verified in the rental workflow.",
    };
  }

  if (input.intent === "repair") {
    const equipmentKnown = Boolean(input.productName);
    const issueKnown = input.job.trim().length >= 8;
    const query = new URLSearchParams();
    if (input.productName) query.set("equipment", input.productName);
    if (issueKnown) query.set("issue", input.job.slice(0, 700));
    const knownFields = [
      equipmentKnown ? "equipment candidate" : "",
      issueKnown ? "fault description" : "",
      signedIn ? "signed-in customer account" : "",
      branchKnown ? "shopping branch preference" : "",
    ].filter(Boolean);
    const missingFields = [
      equipmentKnown ? "" : "equipment type",
      issueKnown ? "" : "fault description",
      "customer contact method",
    ].filter(Boolean);

    return {
      kind: "repair",
      label: equipmentKnown && issueKnown ? "Review repair request" : "Continue to repair request",
      href: `/repairs${query.size ? `?${query.toString()}` : ""}`,
      readiness: equipmentKnown && issueKnown ? "ready_to_continue" : "needs_input",
      requiresMoreInput: missingFields.length > 0,
      knownFields,
      missingFields,
      verificationNote: "Branch preference is optional. The repair team still confirms intake, diagnosis and the next service step after the customer submits the real request.",
    };
  }

  if (input.intent === "commercial") {
    const itemKnown = Boolean(input.productName);
    const requestKnown = input.job.trim().length >= 8;
    const query = new URLSearchParams({ mode: "quote" });
    if (input.productName) query.set("item", input.productName.slice(0, 180));
    if (requestKnown) query.set("details", input.job.trim().slice(0, 700));
    if (input.quantity && Number.isInteger(input.quantity) && input.quantity > 0 && input.quantity <= 9999) {
      query.set("qty", String(input.quantity));
    }
    const knownFields = [
      itemKnown ? "grounded catalogue item" : "",
      requestKnown ? "commercial request context" : "",
      input.quantity ? `quantity ${input.quantity}` : "",
      signedIn ? "signed-in customer account" : "",
      branchKnown ? "selected shopping branch" : "",
    ].filter(Boolean);
    const missingFields = [
      "verified business or organisation identity",
      "business contact details",
      input.quantity ? "" : "final quantity or project scope",
    ].filter(Boolean);

    return {
      kind: "commercial",
      label: "Prepare commercial request",
      href: `/commercial?${query.toString()}`,
      readiness: itemKnown && requestKnown ? "ready_to_continue" : "needs_input",
      requiresMoreInput: true,
      knownFields,
      missingFields,
      verificationNote: "A signed-in customer account is not a verified commercial organisation. Commercial pricing, credit, purchase-order and account-term privileges remain subject to the existing organisation verification workflow.",
    };
  }

  return undefined;
}

export const createConfiguredTotalToolsPlatformService = () => {
  const adapter = createConfiguredTotalToolsAdapter();
  const service = createPlatformBackendService({
    adapter,
    resolveContext: resolveTotalToolsPlatformContext,
  });

  service.runAssistant = async (request, input) => {
    const context = resolveTotalToolsPlatformContext(request);
    const previewMode = context.providerId === PREVIEW_PROVIDER_ID;
    const grounded = await runGroundedAssistantIntelligence(adapter, context, {
      prompt: input.prompt,
      branchId: input.branchId,
      history: input.history,
    });

    if (grounded.warnings.length) {
      console.warn("assistant_provider_read_warning", {
        providerId: context.providerId,
        warningCount: grounded.warnings.length,
      });
    }

    const hasRecommendations = grounded.products.length > 0 || grounded.rentals.length > 0;
    const comparison = grounded.understanding.intent === "compare"
      ? await buildGroundedProductComparison(adapter, context, grounded.products, input.branchId)
      : undefined;
    const repairGuidance = grounded.understanding.intent === "repair"
      ? await buildRepairIntakeGuidance(adapter, context, {
          job: grounded.understanding.job,
          productName: grounded.products[0]?.name,
        })
      : undefined;
    const trustedCustomerId = context.actorId && input.customerId
      ? String(input.customerId)
      : undefined;
    const handoff = workflowHandoff({
      intent: grounded.understanding.intent,
      job: grounded.understanding.job,
      productName: grounded.products[0]?.name,
      rentalAssetId: grounded.rentals[0]?.id ? String(grounded.rentals[0].id) : undefined,
      branchId: input.branchId ? String(input.branchId) : undefined,
      customerId: trustedCustomerId,
      quantity: grounded.understanding.quantity,
    });

    return {
      success: true,
      data: {
        response: comparison || repairGuidance || assistantSummary({
          job: grounded.understanding.job,
          needsClarification: grounded.understanding.needsClarification,
          clarificationQuestion: grounded.understanding.clarificationQuestion,
          productCount: grounded.products.length,
          rentalCount: grounded.rentals.length,
          warnings: grounded.warnings,
          previewMode,
        }),
        recommendedProducts: grounded.products,
        recommendedRentals: grounded.rentals,
        nextActions: followUps(grounded.understanding.intent, hasRecommendations, grounded.understanding.needsClarification),
        workflowHandoff: handoff,
      },
    };
  };

  return service;
};