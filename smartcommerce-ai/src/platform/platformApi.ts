import type {
  Branch,
  CommercialQuoteRequest,
  CommercialQuoteResult,
  CommerceProduct,
  CustomerAccount,
  InventoryAvailability,
  PlatformApiResult,
  PlatformEntityId,
  PlatformInvoice,
  PlatformOrder,
  PlatformPage,
  PlatformSyncResult,
  PlatformWebhookEvent,
  ProductCategory,
  RentalAsset,
  RentalReservationRequest,
  RentalReservationResult,
  RepairJob,
  RepairRequest,
} from "./contracts";
import type {
  InventoryAvailabilityQuery,
  PosAdapter,
  PosAdapterContext,
  PosAdapterHealthStatus,
  ProductSearchQuery,
  RentalAssetQuery,
  RentalAvailabilityQuery,
} from "./posAdapter";
import type {
  AdaptiveProviderProfile,
  SmartCommerceCapability,
} from "./adaptiveIntegration";

export type SmartCommercePlatformApiOptions = {
  adapter: PosAdapter;
  context: PosAdapterContext;
  capabilityProfile?: AdaptiveProviderProfile;
};

export class SmartCommercePlatformApi {
  private adapter: PosAdapter;
  private context: PosAdapterContext;
  private capabilityProfile?: AdaptiveProviderProfile;

  constructor(options: SmartCommercePlatformApiOptions) {
    this.adapter = options.adapter;
    this.context = options.context;
    this.capabilityProfile = options.capabilityProfile;
  }

  setCapabilityProfile(profile?: AdaptiveProviderProfile) {
    this.capabilityProfile = profile;
  }

  getCapabilityProfile() {
    return this.capabilityProfile;
  }

  private requireCapability<T>(
    capability: SmartCommerceCapability
  ): PlatformApiResult<T> | undefined {
    const profile = this.capabilityProfile;
    if (!profile) return undefined;

    const resolved = profile.capabilities.find(
      (entry) => entry.capability === capability
    );

    if (resolved?.availability === "available") return undefined;

    return {
      success: false,
      error: {
        code: "PROVIDER_CAPABILITY_UNAVAILABLE",
        message: resolved
          ? `Provider capability ${capability} is ${resolved.availability} and is not approved for execution.`
          : `Provider capability ${capability} is not present in the validated provider profile.`,
        details: {
          providerId: profile.providerId,
          capability,
          availability: resolved?.availability || "unsupported",
          confidence: resolved?.confidence || 0,
          reason: resolved?.reason,
        },
        retryable: resolved?.availability === "unverified",
      },
    };
  }

  healthCheck(): Promise<PlatformApiResult<PosAdapterHealthStatus>> {
    const blocked = this.requireCapability<PosAdapterHealthStatus>("health");
    return blocked ? Promise.resolve(blocked) : this.adapter.healthCheck(this.context);
  }

  listBranches(): Promise<PlatformApiResult<Branch[]>> {
    const blocked = this.requireCapability<Branch[]>("branches.read");
    return blocked ? Promise.resolve(blocked) : this.adapter.listBranches(this.context);
  }

  listCategories(): Promise<PlatformApiResult<PlatformPage<ProductCategory>>> {
    const blocked = this.requireCapability<PlatformPage<ProductCategory>>(
      "categories.read"
    );
    return blocked ? Promise.resolve(blocked) : this.adapter.listCategories(this.context);
  }

  searchProducts(
    query?: ProductSearchQuery
  ): Promise<PlatformApiResult<PlatformPage<CommerceProduct>>> {
    const blocked = this.requireCapability<PlatformPage<CommerceProduct>>(
      "products.search"
    );
    return blocked
      ? Promise.resolve(blocked)
      : this.adapter.searchProducts(this.context, query);
  }

  getProductById(
    productId: PlatformEntityId
  ): Promise<PlatformApiResult<CommerceProduct>> {
    const blocked = this.requireCapability<CommerceProduct>("products.read");
    return blocked
      ? Promise.resolve(blocked)
      : this.adapter.getProductById(this.context, productId);
  }

  getInventoryAvailability(
    query: InventoryAvailabilityQuery
  ): Promise<PlatformApiResult<InventoryAvailability[]>> {
    const blocked = this.requireCapability<InventoryAvailability[]>(
      "inventory.read"
    );
    return blocked
      ? Promise.resolve(blocked)
      : this.adapter.getInventoryAvailability(this.context, query);
  }

  listRentalAssets(
    query?: RentalAssetQuery
  ): Promise<PlatformApiResult<PlatformPage<RentalAsset>>> {
    const blocked = this.requireCapability<PlatformPage<RentalAsset>>(
      "rentals.read"
    );
    return blocked
      ? Promise.resolve(blocked)
      : this.adapter.listRentalAssets(this.context, query);
  }

  getRentalAssetById(
    rentalAssetId: PlatformEntityId
  ): Promise<PlatformApiResult<RentalAsset>> {
    const blocked = this.requireCapability<RentalAsset>("rentals.read");
    return blocked
      ? Promise.resolve(blocked)
      : this.adapter.getRentalAssetById(this.context, rentalAssetId);
  }

  getRentalAvailability(
    query: RentalAvailabilityQuery
  ): Promise<PlatformApiResult<InventoryAvailability[]>> {
    const blocked = this.requireCapability<InventoryAvailability[]>(
      "rentals.availability"
    );
    return blocked
      ? Promise.resolve(blocked)
      : this.adapter.getRentalAvailability(this.context, query);
  }

  createRentalReservation(
    request: RentalReservationRequest
  ): Promise<PlatformApiResult<RentalReservationResult>> {
    const blocked = this.requireCapability<RentalReservationResult>(
      "rentals.reserve"
    );
    return blocked
      ? Promise.resolve(blocked)
      : this.adapter.createRentalReservation(this.context, request);
  }

  createRepairRequest(
    request: RepairRequest
  ): Promise<PlatformApiResult<RepairJob>> {
    const blocked = this.requireCapability<RepairJob>("repairs.write");
    return blocked
      ? Promise.resolve(blocked)
      : this.adapter.createRepairRequest(this.context, request);
  }

  getRepairJobById(
    repairJobId: PlatformEntityId
  ): Promise<PlatformApiResult<RepairJob>> {
    const blocked = this.requireCapability<RepairJob>("repairs.read");
    return blocked
      ? Promise.resolve(blocked)
      : this.adapter.getRepairJobById(this.context, repairJobId);
  }

  createCommercialQuote(
    request: CommercialQuoteRequest
  ): Promise<PlatformApiResult<CommercialQuoteResult>> {
    const blocked = this.requireCapability<CommercialQuoteResult>(
      "commercial_quotes.write"
    );
    return blocked
      ? Promise.resolve(blocked)
      : this.adapter.createCommercialQuote(this.context, request);
  }

  createCustomer(
    customer: CustomerAccount
  ): Promise<PlatformApiResult<CustomerAccount>> {
    const blocked = this.requireCapability<CustomerAccount>("customers.write");
    return blocked
      ? Promise.resolve(blocked)
      : this.adapter.createCustomer(this.context, customer);
  }

  getCustomerById(
    customerId: PlatformEntityId
  ): Promise<PlatformApiResult<CustomerAccount>> {
    const blocked = this.requireCapability<CustomerAccount>("customers.read");
    return blocked
      ? Promise.resolve(blocked)
      : this.adapter.getCustomerById(this.context, customerId);
  }

  createOrder(order: PlatformOrder): Promise<PlatformApiResult<PlatformOrder>> {
    const blocked = this.requireCapability<PlatformOrder>("orders.write");
    return blocked
      ? Promise.resolve(blocked)
      : this.adapter.createOrder(this.context, order);
  }

  getOrderById(
    orderId: PlatformEntityId
  ): Promise<PlatformApiResult<PlatformOrder>> {
    const blocked = this.requireCapability<PlatformOrder>("orders.read");
    return blocked
      ? Promise.resolve(blocked)
      : this.adapter.getOrderById(this.context, orderId);
  }

  createInvoice(
    invoice: PlatformInvoice
  ): Promise<PlatformApiResult<PlatformInvoice>> {
    const blocked = this.requireCapability<PlatformInvoice>("invoices.write");
    return blocked
      ? Promise.resolve(blocked)
      : this.adapter.createInvoice(this.context, invoice);
  }

  handleWebhook(
    event: PlatformWebhookEvent
  ): Promise<PlatformApiResult<PlatformSyncResult>> {
    const blocked = this.requireCapability<PlatformSyncResult>("webhooks");
    return blocked
      ? Promise.resolve(blocked)
      : this.adapter.handleWebhook(this.context, event);
  }
}
