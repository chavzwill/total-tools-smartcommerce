import type { PlatformEntityId, PlatformMetadata } from "./contracts";

export type BusinessSystemKind = "pos" | "crm" | "srm" | "erp" | "wms" | "rental" | "repair" | "accounting" | "ecommerce" | "delivery" | "other";

export type SmartCommerceCapability =
  | "health"
  | "branches.read"
  | "categories.read"
  | "products.search"
  | "products.read"
  | "products.write"
  | "inventory.read"
  | "pricing.read"
  | "customers.read"
  | "customers.write"
  | "orders.read"
  | "orders.write"
  | "invoices.read"
  | "invoices.write"
  | "rentals.read"
  | "rentals.availability"
  | "rentals.verify_asset"
  | "rentals.verify_customer"
  | "rentals.reserve"
  | "repairs.read"
  | "repairs.write"
  | "commercial_quotes.write"
  | "delivery.read"
  | "sync"
  | "webhooks";

export type ProviderHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export type DiscoveredProviderEndpoint = {
  id: string;
  path: string;
  method: ProviderHttpMethod;
  operationId?: string;
  summary?: string;
  description?: string;
  requestSchema?: unknown;
  responseSchema?: unknown;
  sampleRequest?: unknown;
  sampleResponse?: unknown;
  authRequired?: boolean;
  metadata?: PlatformMetadata;
};

export type SemanticFieldMapping = {
  providerPath: string;
  canonicalPath: string;
  confidence: number;
  evidence?: string[];
};

export type SemanticRouteMapping = {
  endpointId: string;
  capability: SmartCommerceCapability;
  confidence: number;
  safeForAutomaticUse: boolean;
  requiresManualApproval?: boolean;
  fieldMappings?: SemanticFieldMapping[];
  evidence?: string[];
};

export type CapabilityAvailability = "available" | "conditional" | "unsupported" | "unverified" | "disabled";

export type ProviderCapability = {
  capability: SmartCommerceCapability;
  availability: CapabilityAvailability;
  confidence: number;
  routeMappings: SemanticRouteMapping[];
  reason?: string;
};

export type AdaptiveProviderProfile = {
  id: PlatformEntityId;
  businessAccountId: PlatformEntityId;
  connectionId?: PlatformEntityId;
  providerId: string;
  providerKind?: BusinessSystemKind;
  discoveredAt: string;
  validatedAt?: string;
  capabilities: ProviderCapability[];
  metadata?: PlatformMetadata;
};

export type AdaptiveMappingPolicy = {
  minimumReadConfidence: number;
  minimumWriteConfidence: number;
  requireWriteApproval: boolean;
  closeUnsupportedCapabilities: boolean;
};

export const defaultAdaptiveMappingPolicy: AdaptiveMappingPolicy = {
  minimumReadConfidence: 0.72,
  minimumWriteConfidence: 0.92,
  requireWriteApproval: true,
  closeUnsupportedCapabilities: true,
};
