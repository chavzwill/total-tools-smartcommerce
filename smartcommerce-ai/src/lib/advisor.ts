import { createApiClient } from "../apiClient";
import type {
  Branch,
  CommerceProduct,
  InventoryAvailability,
  PlatformApiResult,
  RentalAsset,
} from "../platform";
import type {
  AssistantConversationTurn,
  AssistantRecommendationEvidence,
  AssistantRequest,
  AssistantResult,
  AssistantWorkflowHandoff,
} from "../backend";
import { getCustomerAccount } from "./customerAccount";

export const advisorPrompts = [
  "I need a generator for my farm with no electricity",
  "I need to rent a jackhammer next Thursday",
  "My drill is not working and needs repair",
  "I have a picture of a fitting I need",
  "I need garbage bags for a retail store",
];

export type AdvisorProductAvailability = {
  branchId: string;
  branchName?: string;
  records: InventoryAvailability[];
  lookupStatus: "confirmed" | "unavailable";
};

export type AdvisorUiResult = {
  summary: string;
  products: CommerceProduct[];
  rentals: RentalAsset[];
  recommendationEvidence: AssistantRecommendationEvidence[];
  productAvailability: Record<string, AdvisorProductAvailability>;
  selectedBranchName?: string;
  nextActions: string[];
  workflowHandoff?: AssistantWorkflowHandoff;
};

const api = createApiClient();
const SHOPPING_BRANCH_KEY = "smartcommerce_shopping_branch_v1";

function savedShoppingBranch() {
  try {
    const value = window.localStorage.getItem(SHOPPING_BRANCH_KEY)?.trim();
    return value && value !== "Online" ? value : undefined;
  } catch {
    return undefined;
  }
}

async function resolveSelectedBranchContext() {
  const selectedBranch = savedShoppingBranch();
  if (!selectedBranch) {
    const fallbackId = import.meta.env.VITE_SMARTCOMMERCE_BRANCH_ID || undefined;
    return { id: fallbackId ? String(fallbackId) : undefined, name: undefined as string | undefined };
  }

  const branches = await api.get<Branch[]>("/platform/branches");
  if (!branches.success) return { id: undefined, name: selectedBranch };
  const selected = branches.data.find(
    (branch) => branch.active && branch.name.trim().toLowerCase() === selectedBranch.toLowerCase(),
  );
  return {
    id: selected?.id !== undefined ? String(selected.id) : undefined,
    name: selected?.name || selectedBranch,
  };
}

async function resolveCustomerId() {
  try {
    const state = await getCustomerAccount();
    return state.customer?.id;
  } catch {
    return undefined;
  }
}

async function loadProductAvailability(
  products: CommerceProduct[],
  branch: { id?: string; name?: string },
) {
  if (!branch.id || !products.length) return {} as Record<string, AdvisorProductAvailability>;

  const entries = await Promise.all(products.slice(0, 8).map(async (product) => {
    const productId = String(product.id);
    const path = `/platform/inventory/availability?productId=${encodeURIComponent(productId)}&branchId=${encodeURIComponent(branch.id!)}&quantity=1`;
    const result = await api.get<InventoryAvailability[]>(path);
    const snapshot: AdvisorProductAvailability = {
      branchId: branch.id!,
      branchName: branch.name,
      records: result.success ? result.data : [],
      lookupStatus: result.success ? "confirmed" : "unavailable",
    };
    return [productId, snapshot] as const;
  }));

  return Object.fromEntries(entries) as Record<string, AdvisorProductAvailability>;
}

export async function getAdvisorResponse(
  prompt: string,
  history: AssistantConversationTurn[] = [],
): Promise<PlatformApiResult<AdvisorUiResult>> {
  const [branch, customerId] = await Promise.all([
    resolveSelectedBranchContext(),
    resolveCustomerId(),
  ]);
  const request: AssistantRequest = {
    prompt,
    branchId: branch.id,
    customerId,
    history: history.slice(-6).map((turn) => ({
      role: turn.role,
      content: turn.content.trim().slice(0, 600),
    })).filter((turn) => turn.content.length > 0),
  };
  const result = await api.post<AssistantResult>("/assistant", request);

  if (!result.success) {
    return result;
  }

  const products = result.data.recommendedProducts || [];
  const rentals = result.data.recommendedRentals || [];
  const hasRecommendations = products.length > 0 || rentals.length > 0;
  const productAvailability = await loadProductAvailability(products, branch);

  return {
    success: true,
    requestId: result.requestId,
    data: {
      summary: result.data.response || (hasRecommendations
        ? "SmartCommerce matched your request against the connected catalogue."
        : "The connected provider returned insufficient catalogue or rental data for this request."),
      products,
      rentals,
      recommendationEvidence: result.data.recommendationEvidence || [],
      productAvailability,
      selectedBranchName: branch.name,
      nextActions: result.data.nextActions || [],
      workflowHandoff: result.data.workflowHandoff,
    },
  };
}
