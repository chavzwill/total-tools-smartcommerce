import type { Branch, BusinessAccount, CommercialQuoteRequest, CommercialQuoteResult, CommerceProduct, CustomerAccount, InventoryAvailability, PlatformApiResult, PlatformEntityId, PlatformInvoice, PlatformMetadata, PlatformOrder, PlatformPage, PlatformSyncResult, PlatformWebhookEvent, ProductCategory, RentalAsset, RentalReservationRequest, RentalReservationResult, RepairJob, RepairRequest } from "./contracts";
import type { RepairType } from "../types";
export type PosAdapterCapabilities = {
    branches?: boolean;
    categories?: boolean;
    products?: boolean;
    inventory?: boolean;
    pricing?: boolean;
    customers?: boolean;
    orders?: boolean;
    invoices?: boolean;
    rentals?: boolean;
    rentalReservations?: boolean;
    repairs?: boolean;
    commercialQuotes?: boolean;
    webhooks?: boolean;
    fullSync?: boolean;
    incrementalSync?: boolean;
    realTimeAvailability?: boolean;
    metadata?: PlatformMetadata;
};
export type PosAdapterContext = {
    businessAccountId: PlatformEntityId;
    providerId: string;
    connectionId?: PlatformEntityId;
    actorId?: PlatformEntityId;
    requestId?: string;
    locale?: string;
    timezone?: string;
    metadata?: PlatformMetadata;
};
export type PosAdapterHealthStatus = {
    providerId: string;
    businessAccountId: PlatformEntityId;
    connected: boolean;
    checkedAt: string;
    displayName?: string;
    apiVersion?: string;
    capabilities: PosAdapterCapabilities;
    message?: string;
    metadata?: PlatformMetadata;
};
export type ProductSearchQuery = {
    search?: string;
    categoryId?: PlatformEntityId;
    branchId?: PlatformEntityId;
    sku?: string;
    barcode?: string;
    tags?: string[];
    includeInactive?: boolean;
    page?: number;
    pageSize?: number;
    cursor?: string;
    metadata?: PlatformMetadata;
};
export type RentalAssetQuery = {
    productId?: PlatformEntityId;
    branchId?: PlatformEntityId;
    status?: RentalAsset["status"];
    startDate?: string;
    endDate?: string;
    page?: number;
    pageSize?: number;
    cursor?: string;
    metadata?: PlatformMetadata;
};
export type InventoryAvailabilityQuery = {
    productId: PlatformEntityId;
    branchId?: PlatformEntityId;
    quantity?: number;
    metadata?: PlatformMetadata;
};
export type RentalAvailabilityQuery = {
    rentalAssetId?: PlatformEntityId;
    productId?: PlatformEntityId;
    branchId?: PlatformEntityId;
    startDate: string;
    endDate: string;
    quantity?: number;
    metadata?: PlatformMetadata;
};
export interface PosAdapter {
    healthCheck(context: PosAdapterContext): Promise<PlatformApiResult<PosAdapterHealthStatus>>;
    listBranches(context: PosAdapterContext): Promise<PlatformApiResult<Branch[]>>;
    listCategories(context: PosAdapterContext): Promise<PlatformApiResult<PlatformPage<ProductCategory>>>;
    searchProducts(context: PosAdapterContext, query?: ProductSearchQuery): Promise<PlatformApiResult<PlatformPage<CommerceProduct>>>;
    getProductById(context: PosAdapterContext, productId: PlatformEntityId): Promise<PlatformApiResult<CommerceProduct>>;
    getInventoryAvailability(context: PosAdapterContext, query: InventoryAvailabilityQuery): Promise<PlatformApiResult<InventoryAvailability[]>>;
    listRentalAssets(context: PosAdapterContext, query?: RentalAssetQuery): Promise<PlatformApiResult<PlatformPage<RentalAsset>>>;
    getRentalAssetById(context: PosAdapterContext, rentalAssetId: PlatformEntityId): Promise<PlatformApiResult<RentalAsset>>;
    getRentalAvailability(context: PosAdapterContext, query: RentalAvailabilityQuery): Promise<PlatformApiResult<InventoryAvailability[]>>;
    createRentalReservation(context: PosAdapterContext, request: RentalReservationRequest): Promise<PlatformApiResult<RentalReservationResult>>;
    createRepairRequest(context: PosAdapterContext, request: RepairRequest): Promise<PlatformApiResult<RepairJob>>;
    getRepairJobById(context: PosAdapterContext, repairJobId: PlatformEntityId): Promise<PlatformApiResult<RepairJob>>;
    createCommercialQuote(context: PosAdapterContext, request: CommercialQuoteRequest): Promise<PlatformApiResult<CommercialQuoteResult>>;
    createCustomer(context: PosAdapterContext, customer: CustomerAccount): Promise<PlatformApiResult<CustomerAccount>>;
    getCustomerById(context: PosAdapterContext, customerId: PlatformEntityId): Promise<PlatformApiResult<CustomerAccount>>;
    createOrder(context: PosAdapterContext, order: PlatformOrder): Promise<PlatformApiResult<PlatformOrder>>;
    getOrderById(context: PosAdapterContext, orderId: PlatformEntityId): Promise<PlatformApiResult<PlatformOrder>>;
    createInvoice(context: PosAdapterContext, invoice: PlatformInvoice): Promise<PlatformApiResult<PlatformInvoice>>;
    getInvoiceById?(context: PosAdapterContext, invoiceId: PlatformEntityId): Promise<PlatformApiResult<PlatformInvoice>>;
    createProduct?(context: PosAdapterContext, product: CommerceProduct): Promise<PlatformApiResult<CommerceProduct>>;
    updateProduct?(context: PosAdapterContext, productId: PlatformEntityId, product: Partial<CommerceProduct>): Promise<PlatformApiResult<CommerceProduct>>;
    deleteProduct?(context: PosAdapterContext, productId: PlatformEntityId): Promise<PlatformApiResult<{
        id: PlatformEntityId;
    }>>;
    createRentalAsset?(context: PosAdapterContext, rentalAsset: RentalAsset): Promise<PlatformApiResult<RentalAsset>>;
    updateRentalAsset?(context: PosAdapterContext, rentalAssetId: PlatformEntityId, rentalAsset: Partial<RentalAsset>): Promise<PlatformApiResult<RentalAsset>>;
    deleteRentalAsset?(context: PosAdapterContext, rentalAssetId: PlatformEntityId): Promise<PlatformApiResult<{
        id: PlatformEntityId;
    }>>;
    listRepairCatalog?(context: PosAdapterContext): Promise<PlatformApiResult<PlatformPage<RepairType>>>;
    createRepairCatalogItem?(context: PosAdapterContext, repairType: RepairType): Promise<PlatformApiResult<RepairType>>;
    updateRepairCatalogItem?(context: PosAdapterContext, repairTypeId: PlatformEntityId, repairType: Partial<RepairType>): Promise<PlatformApiResult<RepairType>>;
    deleteRepairCatalogItem?(context: PosAdapterContext, repairTypeId: PlatformEntityId): Promise<PlatformApiResult<{
        id: PlatformEntityId;
    }>>;
    handleWebhook(context: PosAdapterContext, event: PlatformWebhookEvent): Promise<PlatformApiResult<PlatformSyncResult>>;
    getBusinessAccount?(context: PosAdapterContext): Promise<PlatformApiResult<BusinessAccount>>;
}
