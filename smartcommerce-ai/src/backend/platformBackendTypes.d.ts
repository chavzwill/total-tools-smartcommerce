import type { Branch, CommercialQuoteRequest, CommerceProduct, CustomerAccount, InventoryAvailability, PlatformApiResult, PlatformEntityId, PlatformInvoice, PlatformOrder, PlatformPage, PlatformSyncResult, PlatformWebhookEvent, RentalAsset, RentalReservationRequest, RepairJob, RepairRequest, ProductCategory } from "../platform";
import type { PosAdapter, PosAdapterContext, PosAdapterHealthStatus, ProductSearchQuery, RentalAssetQuery, RentalAvailabilityQuery } from "../platform";
import type { RepairType } from "../types";
export type PlatformBackendRuntime = {
    adapter: PosAdapter;
    resolveContext(request: Request): PosAdapterContext | Promise<PosAdapterContext>;
};
export type AssistantRequest = {
    prompt: string;
    branchId?: PlatformEntityId;
    customerId?: PlatformEntityId;
};
export type AssistantResult = {
    response: string;
    recommendedProducts: CommerceProduct[];
    recommendedRentals: RentalAsset[];
    nextActions: string[];
};
export type CheckoutRequest = {
    order: PlatformOrder;
    customer?: CustomerAccount;
    invoice?: PlatformInvoice;
};
export type CheckoutResult = {
    order: PlatformOrder;
    invoice?: PlatformInvoice;
};
export type ProductMutationEndpoint = {
    method: "POST" | "PUT" | "DELETE";
    path: "/platform/products" | "/platform/products/:productId";
    status: "pending_adapter_contract";
    reason: string;
};
export type RentalAssetMutationEndpoint = {
    method: "POST" | "PUT" | "DELETE";
    path: "/platform/rentals/assets" | "/platform/rentals/assets/:rentalAssetId";
    status: "pending_adapter_contract";
    reason: string;
};
export type RepairCatalogMutationEndpoint = {
    method: "GET" | "POST" | "PUT" | "DELETE";
    path: "/platform/repairs/catalog" | "/platform/repairs/catalog/:repairTypeId";
    status: "pending_adapter_contract";
    reason: string;
};
export type PendingBackendEndpoint = ProductMutationEndpoint | RentalAssetMutationEndpoint | RepairCatalogMutationEndpoint;
export type PlatformBackendService = {
    healthCheck(request: Request): Promise<PlatformApiResult<PosAdapterHealthStatus>>;
    listBranches(request: Request): Promise<PlatformApiResult<Branch[]>>;
    listCategories(request: Request): Promise<PlatformApiResult<PlatformPage<ProductCategory>>>;
    getInventoryAvailability(request: Request, query: {
        productId: PlatformEntityId;
        branchId?: PlatformEntityId;
        quantity?: number;
    }): Promise<PlatformApiResult<InventoryAvailability[]>>;
    syncProducts(request: Request): Promise<PlatformApiResult<PlatformSyncResult>>;
    syncRentals(request: Request): Promise<PlatformApiResult<PlatformSyncResult>>;
    syncRepairs(request: Request): Promise<PlatformApiResult<PlatformSyncResult>>;
    searchProducts(request: Request, query?: ProductSearchQuery): Promise<PlatformApiResult<PlatformPage<CommerceProduct>>>;
    getProductById(request: Request, productId: PlatformEntityId): Promise<PlatformApiResult<CommerceProduct>>;
    createProduct(request: Request, input: CommerceProduct): Promise<PlatformApiResult<CommerceProduct>>;
    updateProduct(request: Request, productId: PlatformEntityId, input: Partial<CommerceProduct>): Promise<PlatformApiResult<CommerceProduct>>;
    deleteProduct(request: Request, productId: PlatformEntityId): Promise<PlatformApiResult<{
        id: PlatformEntityId;
    }>>;
    listRentalAssets(request: Request, query?: RentalAssetQuery): Promise<PlatformApiResult<PlatformPage<RentalAsset>>>;
    getRentalAssetById(request: Request, rentalAssetId: PlatformEntityId): Promise<PlatformApiResult<RentalAsset>>;
    createRentalAsset(request: Request, input: RentalAsset): Promise<PlatformApiResult<RentalAsset>>;
    updateRentalAsset(request: Request, rentalAssetId: PlatformEntityId, input: Partial<RentalAsset>): Promise<PlatformApiResult<RentalAsset>>;
    deleteRentalAsset(request: Request, rentalAssetId: PlatformEntityId): Promise<PlatformApiResult<{
        id: PlatformEntityId;
    }>>;
    getRentalAvailability(request: Request, query: RentalAvailabilityQuery): Promise<PlatformApiResult<unknown>>;
    createRentalReservation(request: Request, input: RentalReservationRequest): Promise<PlatformApiResult<unknown>>;
    listRepairCatalog(request: Request): Promise<PlatformApiResult<PlatformPage<RepairType>>>;
    createRepairCatalogItem(request: Request, input: RepairType): Promise<PlatformApiResult<RepairType>>;
    updateRepairCatalogItem(request: Request, repairTypeId: PlatformEntityId, input: Partial<RepairType>): Promise<PlatformApiResult<RepairType>>;
    deleteRepairCatalogItem(request: Request, repairTypeId: PlatformEntityId): Promise<PlatformApiResult<{
        id: PlatformEntityId;
    }>>;
    createRepairRequest(request: Request, input: RepairRequest): Promise<PlatformApiResult<RepairJob>>;
    getRepairJobById(request: Request, repairJobId: PlatformEntityId): Promise<PlatformApiResult<RepairJob>>;
    createCommercialQuote(request: Request, input: CommercialQuoteRequest): Promise<PlatformApiResult<unknown>>;
    createCustomer(request: Request, input: CustomerAccount): Promise<PlatformApiResult<CustomerAccount>>;
    getCustomerById(request: Request, customerId: PlatformEntityId): Promise<PlatformApiResult<CustomerAccount>>;
    createOrder(request: Request, input: PlatformOrder): Promise<PlatformApiResult<PlatformOrder>>;
    getOrderById(request: Request, orderId: PlatformEntityId): Promise<PlatformApiResult<PlatformOrder>>;
    createInvoice(request: Request, input: PlatformInvoice): Promise<PlatformApiResult<PlatformInvoice>>;
    getInvoiceById(request: Request, invoiceId: PlatformEntityId): Promise<PlatformApiResult<PlatformInvoice>>;
    runAssistant(request: Request, input: AssistantRequest): Promise<PlatformApiResult<AssistantResult>>;
    checkout(request: Request, input: CheckoutRequest): Promise<PlatformApiResult<CheckoutResult>>;
    handleWebhook(request: Request, event: PlatformWebhookEvent): Promise<PlatformApiResult<PlatformSyncResult>>;
};
