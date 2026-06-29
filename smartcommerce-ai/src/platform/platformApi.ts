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

export type SmartCommercePlatformApiOptions = {
  adapter: PosAdapter;
  context: PosAdapterContext;
};

export class SmartCommercePlatformApi {
  private adapter: PosAdapter;
  private context: PosAdapterContext;

  constructor(options: SmartCommercePlatformApiOptions) {
    this.adapter = options.adapter;
    this.context = options.context;
  }

  healthCheck(): Promise<PlatformApiResult<PosAdapterHealthStatus>> {
    return this.adapter.healthCheck(this.context);
  }

  listBranches(): Promise<PlatformApiResult<Branch[]>> {
    return this.adapter.listBranches(this.context);
  }

  listCategories(): Promise<PlatformApiResult<PlatformPage<ProductCategory>>> {
    return this.adapter.listCategories(this.context);
  }

  searchProducts(
    query?: ProductSearchQuery
  ): Promise<PlatformApiResult<PlatformPage<CommerceProduct>>> {
    return this.adapter.searchProducts(this.context, query);
  }

  getProductById(
    productId: PlatformEntityId
  ): Promise<PlatformApiResult<CommerceProduct>> {
    return this.adapter.getProductById(this.context, productId);
  }

  getInventoryAvailability(
    query: InventoryAvailabilityQuery
  ): Promise<PlatformApiResult<InventoryAvailability[]>> {
    return this.adapter.getInventoryAvailability(this.context, query);
  }

  listRentalAssets(
    query?: RentalAssetQuery
  ): Promise<PlatformApiResult<PlatformPage<RentalAsset>>> {
    return this.adapter.listRentalAssets(this.context, query);
  }

  getRentalAssetById(
    rentalAssetId: PlatformEntityId
  ): Promise<PlatformApiResult<RentalAsset>> {
    return this.adapter.getRentalAssetById(this.context, rentalAssetId);
  }

  getRentalAvailability(
    query: RentalAvailabilityQuery
  ): Promise<PlatformApiResult<InventoryAvailability[]>> {
    return this.adapter.getRentalAvailability(this.context, query);
  }

  createRentalReservation(
    request: RentalReservationRequest
  ): Promise<PlatformApiResult<RentalReservationResult>> {
    return this.adapter.createRentalReservation(this.context, request);
  }

  createRepairRequest(
    request: RepairRequest
  ): Promise<PlatformApiResult<RepairJob>> {
    return this.adapter.createRepairRequest(this.context, request);
  }

  getRepairJobById(
    repairJobId: PlatformEntityId
  ): Promise<PlatformApiResult<RepairJob>> {
    return this.adapter.getRepairJobById(this.context, repairJobId);
  }

  createCommercialQuote(
    request: CommercialQuoteRequest
  ): Promise<PlatformApiResult<CommercialQuoteResult>> {
    return this.adapter.createCommercialQuote(this.context, request);
  }

  createCustomer(
    customer: CustomerAccount
  ): Promise<PlatformApiResult<CustomerAccount>> {
    return this.adapter.createCustomer(this.context, customer);
  }

  getCustomerById(
    customerId: PlatformEntityId
  ): Promise<PlatformApiResult<CustomerAccount>> {
    return this.adapter.getCustomerById(this.context, customerId);
  }

  createOrder(order: PlatformOrder): Promise<PlatformApiResult<PlatformOrder>> {
    return this.adapter.createOrder(this.context, order);
  }

  getOrderById(
    orderId: PlatformEntityId
  ): Promise<PlatformApiResult<PlatformOrder>> {
    return this.adapter.getOrderById(this.context, orderId);
  }

  createInvoice(
    invoice: PlatformInvoice
  ): Promise<PlatformApiResult<PlatformInvoice>> {
    return this.adapter.createInvoice(this.context, invoice);
  }

  handleWebhook(
    event: PlatformWebhookEvent
  ): Promise<PlatformApiResult<PlatformSyncResult>> {
    return this.adapter.handleWebhook(this.context, event);
  }
}
