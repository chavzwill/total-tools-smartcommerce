import { createApiClient } from "../apiClient";
import type {
  Branch,
  CommerceProduct,
  PlatformApiResult,
  RentalAsset,
} from "../platform";
import type {
  AssistantConversationTurn,
  AssistantRequest,
  AssistantResult,
  AssistantWorkflowHandoff,
} from "../backend";

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

async function resolveSelectedBranchId() {
  const selectedBranch = savedShoppingBranch();
  if (!selectedBranch) return import.meta.env.VITE_SMARTCOMMERCE_BRANCH_ID || undefined;

  const branches = await api.get<Branch[]>("/platform/branches");
  if (!branches.success) return undefined;
  const selected = branches.data.find(
    (branch) => branch.active && branch.name.trim().toLowerCase() === selectedBranch.toLowerCase(),
  );
  return selected?.id;
}

export async function getAdvisorResponse(
  prompt: string,
  history: AssistantConversationTurn[] = [],
): Promise<PlatformApiResult<AdvisorUiResult>> {
  const branchId = await resolveSelectedBranchId();
  const request: AssistantRequest = {
    prompt,
    branchId,
    history: history.slice(-6).map((turn) => ({
      role: turn.role,
      content: turn.content.trim().slice(0, 600),
    })).filter((turn) => turn.content.length > 0),
  };
  const result = await api.post<AssistantResult>("/platform/assistant", request);

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
      summary: result.data.response || (hasRecommendations
        ? "SmartCommerce matched your request against the connected catalogue."
        : "The connected provider returned insufficient catalogue or rental data for this request."),
      products,
      rentals,
      nextActions: result.data.nextActions || [],
      workflowHandoff: result.data.workflowHandoff,
    },
  };
}