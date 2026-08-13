import type {
  AdaptiveMappingPolicy,
  AdaptiveProviderProfile,
  DiscoveredProviderEndpoint,
  ProviderCapability,
  SemanticFieldMapping,
  SemanticRouteMapping,
  SmartCommerceCapability,
} from "./adaptiveIntegration";
import type { PlatformEntityId } from "./contracts";

const WRITE_CAPABILITIES = new Set<SmartCommerceCapability>([
  "products.write",
  "customers.write",
  "orders.write",
  "invoices.write",
  "rentals.reserve",
  "repairs.write",
  "commercial_quotes.write",
]);

const ROUTE_RULES: Array<{
  capability: SmartCommerceCapability;
  methods?: DiscoveredProviderEndpoint["method"][];
  tokens: string[];
}> = [
  { capability: "branches.read", methods: ["GET"], tokens: ["branch", "store", "location", "site"] },
  { capability: "categories.read", methods: ["GET"], tokens: ["category", "department", "taxonomy"] },
  { capability: "products.search", methods: ["GET"], tokens: ["product", "item", "catalog", "merchandise", "sku"] },
  { capability: "products.read", methods: ["GET"], tokens: ["product", "item", "catalog", "merchandise", "sku"] },
  { capability: "products.write", methods: ["POST", "PUT", "PATCH", "DELETE"], tokens: ["product", "item", "catalog", "merchandise"] },
  { capability: "inventory.read", methods: ["GET"], tokens: ["inventory", "stock", "availability", "quantity", "onhand"] },
  { capability: "pricing.read", methods: ["GET"], tokens: ["price", "pricing", "rate", "amount", "promotion"] },
  { capability: "customers.read", methods: ["GET"], tokens: ["customer", "client", "account", "buyer", "contact"] },
  { capability: "customers.write", methods: ["POST", "PUT", "PATCH"], tokens: ["customer", "client", "account", "buyer", "contact"] },
  { capability: "orders.read", methods: ["GET"], tokens: ["order", "sale", "transaction"] },
  { capability: "orders.write", methods: ["POST", "PUT", "PATCH"], tokens: ["order", "sale", "transaction", "checkout"] },
  { capability: "invoices.read", methods: ["GET"], tokens: ["invoice", "billing"] },
  { capability: "invoices.write", methods: ["POST", "PUT", "PATCH"], tokens: ["invoice", "billing"] },
  { capability: "rentals.read", methods: ["GET"], tokens: ["rental", "hire", "asset", "equipment"] },
  { capability: "rentals.availability", methods: ["GET"], tokens: ["rental", "availability", "schedule", "reservation", "booking"] },
  { capability: "rentals.reserve", methods: ["POST", "PUT", "PATCH"], tokens: ["rental", "reservation", "booking", "hire"] },
  { capability: "repairs.read", methods: ["GET"], tokens: ["repair", "service", "workorder", "job"] },
  { capability: "repairs.write", methods: ["POST", "PUT", "PATCH"], tokens: ["repair", "service", "workorder", "job"] },
  { capability: "commercial_quotes.write", methods: ["POST", "PUT", "PATCH"], tokens: ["quote", "quotation", "estimate", "rfq"] },
  { capability: "delivery.read", methods: ["GET"], tokens: ["delivery", "shipping", "dispatch", "freight"] },
  { capability: "webhooks", methods: ["POST"], tokens: ["webhook", "callback", "event"] },
  { capability: "sync", tokens: ["sync", "synchronize", "import", "export"] },
  { capability: "health", methods: ["GET", "HEAD"], tokens: ["health", "status", "ping", "version"] },
];

const FIELD_RULES: Array<{ canonicalPath: string; aliases: string[] }> = [
  { canonicalPath: "id", aliases: ["id", "item_id", "product_id", "external_id", "code"] },
  { canonicalPath: "sku", aliases: ["sku", "item_code", "product_code", "stock_code"] },
  { canonicalPath: "barcode", aliases: ["barcode", "upc", "ean", "gtin"] },
  { canonicalPath: "name", aliases: ["name", "title", "descr", "description", "item_name", "product_name"] },
  { canonicalPath: "brand", aliases: ["brand", "manufacturer", "make"] },
  { canonicalPath: "pricing.listPrice", aliases: ["price", "list_price", "retail_price", "sell_price", "sell_amt", "amount"] },
  { canonicalPath: "pricing.salePrice", aliases: ["sale_price", "promo_price", "special_price", "discount_price"] },
  { canonicalPath: "quantityAvailable", aliases: ["quantity_available", "qty_available", "qty_free", "available_qty", "free_qty", "stock_available"] },
  { canonicalPath: "quantityOnHand", aliases: ["quantity_on_hand", "qty_on_hand", "stock_qty", "on_hand", "onhand"] },
  { canonicalPath: "branchId", aliases: ["branch_id", "branch", "site_id", "site", "location_id", "location", "store_id"] },
  { canonicalPath: "customer.id", aliases: ["customer_id", "client_id", "account_id", "buyer_id", "contact_id"] },
  { canonicalPath: "customer.email", aliases: ["email", "email_address", "customer_email"] },
  { canonicalPath: "customer.phone", aliases: ["phone", "telephone", "mobile", "customer_phone"] },
  { canonicalPath: "rental.assetId", aliases: ["asset_id", "rental_asset_id", "machine_id", "equipment_id", "asset_tag"] },
  { canonicalPath: "rental.serialNumber", aliases: ["serial", "serial_number", "serial_no"] },
  { canonicalPath: "status", aliases: ["status", "state", "availability_status"] },
];

const normalize = (value: unknown) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const flattenKeys = (value: unknown, prefix = "", depth = 0): string[] => {
  if (depth > 3 || value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.length ? flattenKeys(value[0], prefix, depth + 1) : [];
  if (typeof value !== "object") return [];

  const result: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    result.push(path, ...flattenKeys(child, path, depth + 1));
  }
  return result;
};

export const inferSemanticFieldMappings = (sample: unknown): SemanticFieldMapping[] => {
  const mappings: SemanticFieldMapping[] = [];

  for (const providerPath of flattenKeys(sample)) {
    const leaf = normalize(providerPath.split(".").pop());
    for (const rule of FIELD_RULES) {
      const exact = rule.aliases.some((alias) => normalize(alias) === leaf);
      const partial = rule.aliases.some((alias) => {
        const candidate = normalize(alias);
        return leaf.includes(candidate) || candidate.includes(leaf);
      });
      if (!exact && !partial) continue;

      mappings.push({
        providerPath,
        canonicalPath: rule.canonicalPath,
        confidence: exact ? 0.96 : 0.78,
        evidence: [exact ? "exact_field_alias" : "partial_field_alias"],
      });
      break;
    }
  }

  return mappings;
};

export const inferSemanticRouteMappings = (
  endpoints: DiscoveredProviderEndpoint[],
  policy: AdaptiveMappingPolicy
): SemanticRouteMapping[] => {
  const mappings: SemanticRouteMapping[] = [];

  for (const endpoint of endpoints) {
    const fieldMappings = inferSemanticFieldMappings(endpoint.sampleResponse);
    const corpus = normalize(
      [endpoint.path, endpoint.operationId, endpoint.summary, endpoint.description, ...flattenKeys(endpoint.sampleResponse)].join(" ")
    );

    for (const rule of ROUTE_RULES) {
      if (rule.methods && !rule.methods.includes(endpoint.method)) continue;
      const matched = rule.tokens.filter((token) => corpus.includes(normalize(token)));
      if (!matched.length) continue;

      const semanticEvidence = Math.min(fieldMappings.length * 0.015, 0.09);
      const confidence = Math.min(0.55 + matched.length * 0.08 + semanticEvidence, 0.99);
      const isWrite = WRITE_CAPABILITIES.has(rule.capability);
      const threshold = isWrite ? policy.minimumWriteConfidence : policy.minimumReadConfidence;

      mappings.push({
        endpointId: endpoint.id,
        capability: rule.capability,
        confidence,
        safeForAutomaticUse: confidence >= threshold && (!isWrite || !policy.requireWriteApproval),
        requiresManualApproval: isWrite && policy.requireWriteApproval,
        fieldMappings,
        evidence: [
          ...matched.map((token) => `semantic_token:${token}`),
          ...(fieldMappings.length ? ["response_field_semantics"] : []),
        ],
      });
    }
  }

  return mappings.sort((a, b) => b.confidence - a.confidence);
};

export const buildAdaptiveProviderProfile = (input: {
  businessAccountId: PlatformEntityId;
  connectionId?: PlatformEntityId;
  providerId: string;
  mappings: SemanticRouteMapping[];
  policy: AdaptiveMappingPolicy;
  discoveredAt?: string;
}): AdaptiveProviderProfile => {
  const grouped = new Map<SmartCommerceCapability, SemanticRouteMapping[]>();
  for (const mapping of input.mappings) {
    grouped.set(mapping.capability, [...(grouped.get(mapping.capability) || []), mapping]);
  }

  const capabilities = Array.from(new Set(ROUTE_RULES.map((rule) => rule.capability))).map<ProviderCapability>((capability) => {
    const routeMappings = (grouped.get(capability) || []).sort((a, b) => b.confidence - a.confidence);
    const best = routeMappings[0];
    const isWrite = WRITE_CAPABILITIES.has(capability);
    const threshold = isWrite ? input.policy.minimumWriteConfidence : input.policy.minimumReadConfidence;

    if (!best) {
      return {
        capability,
        availability: input.policy.closeUnsupportedCapabilities ? "unsupported" : "unverified",
        confidence: 0,
        routeMappings: [],
        reason: "No semantically compatible provider route was discovered.",
      };
    }

    if (best.confidence < threshold) {
      return {
        capability,
        availability: "unverified",
        confidence: best.confidence,
        routeMappings,
        reason: "Mapping did not meet the configured confidence threshold.",
      };
    }

    if (isWrite && input.policy.requireWriteApproval) {
      return {
        capability,
        availability: "conditional",
        confidence: best.confidence,
        routeMappings,
        reason: "Transactional mapping requires explicit verification before activation.",
      };
    }

    return {
      capability,
      availability: "available",
      confidence: best.confidence,
      routeMappings,
    };
  });

  return {
    id: `${input.businessAccountId}:${input.providerId}:adaptive-profile`,
    businessAccountId: input.businessAccountId,
    connectionId: input.connectionId,
    providerId: input.providerId,
    discoveredAt: input.discoveredAt || new Date().toISOString(),
    capabilities,
  };
};
