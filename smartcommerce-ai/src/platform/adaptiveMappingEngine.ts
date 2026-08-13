import type {
  AdaptiveMappingPolicy,
  AdaptiveProviderProfile,
  BusinessSystemKind,
  DiscoveredProviderEndpoint,
  ProviderCapability,
  ProviderHttpMethod,
  SemanticFieldMapping,
  SemanticRouteMapping,
  SmartCommerceCapability,
} from "./adaptiveIntegration";
import { defaultAdaptiveMappingPolicy } from "./adaptiveIntegration";
import type { PlatformEntityId, PlatformMetadata } from "./contracts";

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
  { capability: "rentals.verify_asset", methods: ["GET"], tokens: ["rental", "asset", "machine", "equipment", "inspection", "maintenance"] },
  { capability: "rentals.verify_customer", methods: ["GET", "POST"], tokens: ["rental", "customer", "eligibility", "verification", "qualification", "credit"] },
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
  { canonicalPath: "rental.inspectionStatus", aliases: ["inspection_status", "inspection_state", "safety_status"] },
  { canonicalPath: "rental.maintenanceStatus", aliases: ["maintenance_status", "service_status", "maintenance_state"] },
  { canonicalPath: "rental.eligibilityStatus", aliases: ["eligibility", "eligibility_status", "qualification_status"] },
  { canonicalPath: "status", aliases: ["status", "state", "availability_status"] },
];

const normalize = (value: unknown) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

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

const sampleFromSchema = (schema: unknown): unknown => {
  const record = asRecord(schema);
  if (!record) return undefined;
  if ("example" in record) return record.example;
  if (Array.isArray(record.examples) && record.examples.length) return record.examples[0];
  if (record.type === "array" && record.items) {
    const child = sampleFromSchema(record.items);
    return child === undefined ? [] : [child];
  }

  const properties = asRecord(record.properties);
  if (!properties) return undefined;

  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    const property = asRecord(value);
    if (!property) continue;
    if ("example" in property) output[key] = property.example;
    else if ("default" in property) output[key] = property.default;
    else if (Array.isArray(property.enum) && property.enum.length) output[key] = property.enum[0];
    else if (property.type === "string") output[key] = "";
    else if (property.type === "number" || property.type === "integer") output[key] = 0;
    else if (property.type === "boolean") output[key] = false;
    else if (property.type === "array") output[key] = [];
    else if (property.type === "object" || property.properties) output[key] = sampleFromSchema(property);
  }
  return output;
};

const operationSchema = (
  operation: Record<string, unknown>,
  kind: "request" | "response"
) => {
  if (kind === "request") {
    const body = asRecord(operation.requestBody);
    const content = body ? asRecord(body.content) : undefined;
    const media = content
      ? asRecord(content["application/json"] || content["application/*+json"] || Object.values(content)[0])
      : undefined;
    return media?.schema;
  }

  const responses = asRecord(operation.responses);
  if (!responses) return undefined;
  const response = asRecord(
    responses["200"] || responses["201"] || responses.default || Object.values(responses)[0]
  );
  const content = response ? asRecord(response.content) : undefined;
  const media = content
    ? asRecord(content["application/json"] || content["application/*+json"] || Object.values(content)[0])
    : undefined;
  return media?.schema;
};

export const discoverEndpointsFromApiDescription = (
  apiDescription: unknown
): DiscoveredProviderEndpoint[] => {
  const root = asRecord(apiDescription);
  const paths = root ? asRecord(root.paths) : undefined;
  if (!paths) return [];

  const allowed = new Set<ProviderHttpMethod>([
    "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS",
  ]);
  const endpoints: DiscoveredProviderEndpoint[] = [];

  for (const [path, pathValue] of Object.entries(paths)) {
    const pathRecord = asRecord(pathValue);
    if (!pathRecord) continue;

    for (const [methodRaw, operationValue] of Object.entries(pathRecord)) {
      const method = methodRaw.toUpperCase() as ProviderHttpMethod;
      if (!allowed.has(method)) continue;
      const operation = asRecord(operationValue);
      if (!operation) continue;
      const requestSchema = operationSchema(operation, "request");
      const responseSchema = operationSchema(operation, "response");

      endpoints.push({
        id: String(operation.operationId || `${method}:${path}`),
        path,
        method,
        operationId: typeof operation.operationId === "string" ? operation.operationId : undefined,
        summary: typeof operation.summary === "string" ? operation.summary : undefined,
        description: typeof operation.description === "string" ? operation.description : undefined,
        requestSchema,
        responseSchema,
        sampleRequest: sampleFromSchema(requestSchema),
        sampleResponse: sampleFromSchema(responseSchema),
        authRequired: Array.isArray(operation.security)
          ? operation.security.length > 0
          : Array.isArray(root?.security) && root.security.length > 0,
      });
    }
  }

  return endpoints;
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
  providerKind?: BusinessSystemKind;
  mappings: SemanticRouteMapping[];
  policy: AdaptiveMappingPolicy;
  discoveredAt?: string;
  metadata?: PlatformMetadata;
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
    providerKind: input.providerKind,
    discoveredAt: input.discoveredAt || new Date().toISOString(),
    capabilities,
    metadata: input.metadata,
  };
};

export type AdaptiveDiscoveryResult = {
  endpoints: DiscoveredProviderEndpoint[];
  profile: AdaptiveProviderProfile;
  warnings: string[];
};

/**
 * Runs deterministic discovery over an API description or an already-normalized
 * endpoint list. It does not execute any discovered provider endpoint.
 */
export const runAdaptiveDiscovery = (input: {
  businessAccountId: PlatformEntityId;
  connectionId?: PlatformEntityId;
  providerId: string;
  providerKind?: BusinessSystemKind;
  apiDescription?: unknown;
  endpoints?: DiscoveredProviderEndpoint[];
  policy?: Partial<AdaptiveMappingPolicy>;
  metadata?: PlatformMetadata;
}): AdaptiveDiscoveryResult => {
  const policy: AdaptiveMappingPolicy = {
    ...defaultAdaptiveMappingPolicy,
    ...input.policy,
  };
  const endpoints = input.endpoints?.length
    ? input.endpoints
    : discoverEndpointsFromApiDescription(input.apiDescription);
  const mappings = inferSemanticRouteMappings(endpoints, policy);
  const profile = buildAdaptiveProviderProfile({
    businessAccountId: input.businessAccountId,
    connectionId: input.connectionId,
    providerId: input.providerId,
    providerKind: input.providerKind,
    mappings,
    policy,
    metadata: input.metadata,
  });

  const warnings: string[] = [];
  if (!endpoints.length) warnings.push("No endpoints were discoverable from the supplied API description.");
  if (endpoints.length && !mappings.length) warnings.push("Endpoints were discovered but no semantic capability mapping was established.");
  if (!profile.capabilities.some((capability) => capability.availability === "available")) {
    warnings.push("No capability is approved for automatic execution under the current mapping policy.");
  }

  return { endpoints, profile, warnings };
};
