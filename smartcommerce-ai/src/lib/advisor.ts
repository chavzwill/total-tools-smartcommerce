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

  try {
    const response = await fetch("/api/commerce-assistant", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Business-Account-Id": context.businessAccountId,
        "X-Provider-Id": context.providerId,
        "X-Request-Id": context.requestId || `${Date.now()}`,
      },
      body: JSON.stringify(request),
    });
    const result = (await response.json()) as PlatformApiResult<AssistantResult>;

    if (!result.success) return result;

    return {
      success: true,
      requestId: result.requestId,
      data: {
        summary: result.data.response,
        products: result.data.recommendedProducts || [],
        rentals: result.data.recommendedRentals || [],
        nextActions: result.data.nextActions || [],
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: "COMMERCE_ASSISTANT_NETWORK_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "SmartCommerce AI could not reach the server.",
      },
    };
  }
}
