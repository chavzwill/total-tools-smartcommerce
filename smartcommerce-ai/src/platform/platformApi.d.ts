import type { Branch, CommercialQuoteRequest, CommercialQuoteResult, CommerceProduct, CustomerAccount, InventoryAvailability, PlatformApiResult, PlatformEntityId, PlatformInvoice, PlatformOrder, PlatformPage, PlatformSyncResult, PlatformWebhookEvent, ProductCategory, RentalAsset, RentalReservationRequest, RentalReservationResult, RepairJob, RepairRequest } from "./contracts";
import type { InventoryAvailabilityQuery, PosAdapter, PosAdapterContext, PosAdapterHealthStatus, ProductSearchQuery, RentalAssetQuery, RentalAvailabilityQuery } from "./posAdapter";
export type SmartCommercePlatformApiOptions = {
    adapter: PosAdapter;
    context: PosAdapterContext;
};
export declare class SmartCommercePlatformApi {
    private adapter;
    private context;
    constructor(options: SmartCommercePlatformApiOptions);
    healthCheck(): Promise<PlatformApiResult<PosAdapterHealthStatus>>;
    listBranches(): Promise<PlatformApiResult<Branch[]>>;
    listCategories(): Promise<PlatformApiResult<PlatformPage<ProductCategory>>>;
    searchProducts(query?: ProductSearchQuery): Promise<PlatformApiResult<PlatformPage<CommerceProduct>>>;
    getProductById(productId: PlatformEntityId): Promise<PlatformApiResult<CommerceProduct>>;
    getInventoryAvailability(query: InventoryAvailabilityQuery): Promise<PlatformApiResult<InventoryAvailability[]>>;
    listRentalAssets(query?: RentalAssetQuery): Promise<PlatformApiResult<PlatformPage<RentalAsset>>>;
    getRentalAssetById(rentalAssetId: PlatformEntityId): Promise<PlatformApiResult<RentalAsset>>;
    getRentalAvailability(query: RentalAvailabilityQuery): Promise<PlatformApiResult<InventoryAvailability[]>>;
    createRentalReservation(request: RentalReservationRequest): Promise<PlatformApiResult<RentalReservationResult>>;
    createRepairRequest(request: RepairRequest): Promise<PlatformApiResult<RepairJob>>;
    getRepairJobById(repairJobId: PlatformEntityId): Promise<PlatformApiResult<RepairJob>>;
    createCommercialQuote(request: CommercialQuoteRequest): Promise<PlatformApiResult<CommercialQuoteResult>>;
    createCustomer(customer: CustomerAccount): Promise<PlatformApiResult<CustomerAccount>>;
    getCustomerById(customerId: PlatformEntityId): Promise<PlatformApiResult<CustomerAccount>>;
    createOrder(order: PlatformOrder): Promise<PlatformApiResult<PlatformOrder>>;
    getOrderById(orderId: PlatformEntityId): Promise<PlatformApiResult<PlatformOrder>>;
    createInvoice(invoice: PlatformInvoice): Promise<PlatformApiResult<PlatformInvoice>>;
    handleWebhook(event: PlatformWebhookEvent): Promise<PlatformApiResult<PlatformSyncResult>>;
}
