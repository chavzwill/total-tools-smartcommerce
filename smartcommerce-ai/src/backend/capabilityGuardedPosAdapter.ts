import type {
  PlatformApiResult,
} from "../platform/contracts";
import type {
  PosAdapter,
  PosAdapterContext,
} from "../platform/posAdapter";
import type {
  AdaptiveProfileRepository,
} from "../platform/adaptiveProfileLifecycle";
import type {
  SmartCommerceCapability,
} from "../platform/adaptiveIntegration";

const METHOD_CAPABILITIES: Record<string, SmartCommerceCapability> = {
  healthCheck: "health",
  listBranches: "branches.read",
  listCategories: "categories.read",
  searchProducts: "products.search",
  getProductById: "products.read",
  createProduct: "products.write",
  updateProduct: "products.write",
  deleteProduct: "products.write",
  getInventoryAvailability: "inventory.read",
  listRentalAssets: "rentals.read",
  getRentalAssetById: "rentals.read",
  getRentalAvailability: "rentals.availability",
  verifyRental: "rentals.verify_asset",
  createRentalAsset: "rentals.reserve",
  updateRentalAsset: "rentals.reserve",
  deleteRentalAsset: "rentals.reserve",
  createRentalReservation: "rentals.reserve",
  listRepairCatalog: "repairs.read",
  createRepairCatalogItem: "repairs.write",
  updateRepairCatalogItem: "repairs.write",
  deleteRepairCatalogItem: "repairs.write",
  createRepairRequest: "repairs.write",
  getRepairJobById: "repairs.read",
  createCommercialQuote: "commercial_quotes.write",
  createCustomer: "customers.write",
  getCustomerById: "customers.read",
  createOrder: "orders.write",
  getOrderById: "orders.read",
  createInvoice: "invoices.write",
  getInvoiceById: "invoices.read",
  handleWebhook: "webhooks",
};

export type CapabilityGuardedPosAdapterOptions = {
  requireProfile?: boolean;
};

const profileIdFor = (context: PosAdapterContext) =>
  `${context.businessAccountId}:${context.providerId}:adaptive-profile`;

const blocked = <T>(input: {
  context: PosAdapterContext;
  capability: SmartCommerceCapability;
  availability: string;
  confidence?: number;
  reason?: string;
}): PlatformApiResult<T> => ({
  success: false,
  requestId: input.context.requestId,
  error: {
    code: "PROVIDER_CAPABILITY_UNAVAILABLE",
    message: `Provider capability ${input.capability} is ${input.availability} and cannot be executed by this backend runtime.`,
    details: {
      providerId: input.context.providerId,
      businessAccountId: input.context.businessAccountId,
      capability: input.capability,
      availability: input.availability,
      confidence: input.confidence || 0,
      reason: input.reason,
    },
    retryable: input.availability === "unverified",
  },
});

/**
 * Wraps a provider adapter so persisted adaptive capability decisions are
 * enforced at the server boundary. The underlying adapter is never called when
 * the validated profile closes the required capability.
 */
export const createCapabilityGuardedPosAdapter = (
  adapter: PosAdapter,
  repository: AdaptiveProfileRepository,
  options: CapabilityGuardedPosAdapterOptions = {}
): PosAdapter => {
  const requireProfile = options.requireProfile ?? true;

  return new Proxy(adapter as unknown as Record<string, unknown>, {
    get(target, property, receiver) {
      const original = Reflect.get(target, property, receiver);
      if (typeof original !== "function") return original;

      const capability = METHOD_CAPABILITIES[String(property)];
      if (!capability) return original.bind(target);

      return async (...args: unknown[]) => {
        const context = args[0] as PosAdapterContext;
        const profile = await repository.load(profileIdFor(context));

        if (!profile) {
          if (!requireProfile) return original.apply(target, args);
          return blocked({
            context,
            capability,
            availability: "unverified",
            reason: "No persisted adaptive provider profile exists.",
          });
        }

        const resolved = profile.capabilities.find(
          (entry) => entry.capability === capability
        );

        if (!resolved || resolved.availability !== "available") {
          return blocked({
            context,
            capability,
            availability: resolved?.availability || "unsupported",
            confidence: resolved?.confidence,
            reason: resolved?.reason,
          });
        }

        return original.apply(target, args);
      };
    },
  }) as unknown as PosAdapter;
};
