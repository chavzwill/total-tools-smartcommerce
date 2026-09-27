import type { CommerceProduct, InventoryAvailability } from "../platform";

export type ProductVisualAnalysis = {
  productType: string;
  brand: string;
  model: string;
  visibleText: string[];
  attributes: string[];
  searchTerms: string[];
  confidence: number;
  notes: string;
};

export type ProductMatchRequest = {
  imageDataUrl: string;
  branchId?: string;
  priorAnalysis?: ProductVisualAnalysis;
};

export type ProductMatchCandidate = {
  product: CommerceProduct;
  confidence: number;
  reasons: string[];
  availability: InventoryAvailability[];
};

export type ProductMatchResult = {
  analysis: ProductVisualAnalysis;
  candidates: ProductMatchCandidate[];
  branchNames: Record<string, string>;
  evidenceImages: number;
  needsClarification: boolean;
  clarification?: string;
};
