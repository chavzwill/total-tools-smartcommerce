import { createApiClient } from "../apiClient";
import type {
  CommerceProduct,
  PlatformApiResult,
  PosAdapterContext,
  RentalAsset,
} from "../platform";
import type { AssistantRequest, AssistantResult } from "../backend";

export const advisorPrompts = [
  "I need a generator for my farm with no electricity",
  "I need to rent a jackhammer next Thursday",
  "My drill is not working and needs repair",
  "I have a picture of a fitting I need",
  "I need garbage bags for a retail store",
];

export type AdvisorUiResult = {
  summary: string;
  products: CommerceProduct[];
  rentals: RentalAsset[];
  nextActions: string[];
};

const api = createApiClient();

function buildConfiguredContext(): PosAdapterContext | undefined {
  const businessAccountId = import.meta.env.VITE_SMARTCOMMERCE_BUSINESS_ID;
  const providerId = import.meta.env.VITE_SMARTCOMMERCE_PROVIDER_ID;

  if (!businessAccountId || !providerId) return undefined;

  return {
    businessAccountId,
    providerId,
    requestId:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  };
}

export async function getAdvisorResponse(
  prompt: string
): Promise<PlatformApiResult<AdvisorUiResult>> {
  const context = buildConfiguredContext();

  if (!context) {
    return {
      success: false,
      error: {
        code: "PLATFORM_CONTEXT_REQUIRED",
        message:
          "AI assistant requires configured business and provider context before serving recommendations.",
      },
    };
  }

  const request: AssistantRequest = {
    prompt,
    branchId: import.meta.env.VITE_SMARTCOMMERCE_BRANCH_ID,
  };
  const result = await api.post<AssistantResult>("/platform/assistant", request, context);

  if (!result.success) {
    return result;
  }

  const products = result.data.recommendedProducts || [];
  const rentals = result.data.recommendedRentals || [];
  const hasRecommendations = products.length > 0 || rentals.length > 0;

  return {
    success: true,
    requestId: result.requestId,
    data: {
      summary: hasRecommendations
        ? result.data.response
        : "The connected provider returned insufficient catalog or rental data for this request.",
      products,
      rentals,
      nextActions: result.data.nextActions || [],
    },
  };
}
