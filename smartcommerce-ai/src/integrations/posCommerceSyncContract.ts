export const POS_COMMERCE_SYNC_SOURCE = "total_tools_pos" as const;

export type PosCommerceSyncEntityType =
  | "brand"
  | "category"
  | "product"
  | "product_variation"
  | "media"
  | "price"
  | "availability"
  | "promotion"
  | "customer"
  | "repair"
  | "rental"
  | "request";

export type PosCommerceSyncEnvelope = {
  eventId: string;
  eventType: string;
  entityType: PosCommerceSyncEntityType;
  entityId: string;
  entityVersion: number;
  occurredAt: string;
  source: typeof POS_COMMERCE_SYNC_SOURCE;
  correlationId: string;
  payload: Record<string, unknown>;
};

export type PosCommerceFieldAuthority = "pos" | "website" | "shared_review";
export const POS_COMMERCE_FIELD_AUTHORITY = {
  brand: { identity: "pos", displayName: "pos", description: "shared_review", seo: "website" },
  category: { identity: "pos", hierarchy: "pos", displayName: "pos", description: "shared_review", seo: "website" },
  product: { identity: "pos", sku: "pos", barcode: "pos", partNumber: "pos", operationalDescription: "pos", editorialDescription: "website", seo: "website" },
  product_variation: { identity: "pos", sku: "pos", attributes: "pos" },
  media: { identity: "pos", asset: "pos", altText: "shared_review", ordering: "shared_review" },
  price: { identity: "pos", amount: "pos", tax: "pos", eligibility: "pos" },
  availability: { identity: "pos", state: "pos", quantity: "pos" },
  promotion: { identity: "pos", rules: "pos", schedule: "pos", artwork: "pos" },
  customer: { identity: "shared_review", publicProfile: "shared_review", internalFinancials: "pos" },
  repair: { lifecycle: "pos", customerVisibleStatus: "pos", internalNotes: "pos" },
  rental: { lifecycle: "pos", availability: "pos", customerVisibleStatus: "pos" },
  request: { websiteSubmission: "website", operationalDisposition: "pos" },
} as const satisfies Record<PosCommerceSyncEntityType, Record<string, PosCommerceFieldAuthority>>;

export const POS_CATALOG_DEPENDENCY_ORDER: PosCommerceSyncEntityType[] = [
  "brand",
  "category",
  "product",
  "product_variation",
  "media",
  "price",
  "availability",
  "promotion",
];

export type PosSyncDisposition = "applied" | "replayed" | "stale" | "conflict" | "blocked";
