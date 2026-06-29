import type {
  CommercialQuoteRequest,
  CommerceProduct,
  CustomerAccount,
  PlatformApiResult,
  PlatformEntityId,
  PlatformInvoice,
  PlatformOrder,
  PlatformPage,
  PlatformSyncResult,
  PlatformWebhookEvent,
  RentalAsset,
  RentalReservationRequest,
  RepairJob,
  RepairRequest,
} from "../platform";
import type {
  PosAdapter,
  PosAdapterContext,
  ProductSearchQuery,
  RentalAssetQuery,
  RentalAvailabilityQuery,
} from "../platform";
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

export type PendingBackendEndpoint =
  | ProductMutationEndpoint
  | RentalAssetMutationEndpoint
  | RepairCatalogMutationEndpoint;

export type PlatformBackendService = {
  syncProducts(request: Request): Promise<PlatformApiResult<PlatformSyncResult>>;
  syncRentals(request: Request): Promise<PlatformApiResult<PlatformSyncResult>>;
  syncRepairs(request: Request): Promise<PlatformApiResult<PlatformSyncResult>>;
  searchProducts(
    request: Request,
    query?: ProductSearchQuery
  ): Promise<PlatformApiResult<PlatformPage<CommerceProduct>>>;
  getProductById(
    request: Request,
    productId: PlatformEntityId
  ): Promise<PlatformApiResult<CommerceProduct>>;
  listRentalAssets(
    request: Request,
    query?: RentalAssetQuery
  ): Promise<PlatformApiResult<PlatformPage<RentalAsset>>>;
  getRentalAssetById(
    request: Request,
    rentalAssetId: PlatformEntityId
  ): Promise<PlatformApiResult<RentalAsset>>;
  getRentalAvailability(
    request: Request,
    query: RentalAvailabilityQuery
  ): Promise<PlatformApiResult<unknown>>;
  createRentalReservation(
    request: Request,
    input: RentalReservationRequest
  ): Promise<PlatformApiResult<unknown>>;
  listRepairCatalog(
    request: Request
  ): Promise<PlatformApiResult<PlatformPage<RepairType>>>;
  createRepairRequest(
    request: Request,
    input: RepairRequest
  ): Promise<PlatformApiResult<RepairJob>>;
  getRepairJobById(
    request: Request,
    repairJobId: PlatformEntityId
  ): Promise<PlatformApiResult<RepairJob>>;
  createCommercialQuote(
    request: Request,
    input: CommercialQuoteRequest
  ): Promise<PlatformApiResult<unknown>>;
  createCustomer(
    request: Request,
    input: CustomerAccount
  ): Promise<PlatformApiResult<CustomerAccount>>;
  getCustomerById(
    request: Request,
    customerId: PlatformEntityId
  ): Promise<PlatformApiResult<CustomerAccount>>;
  createOrder(
    request: Request,
    input: PlatformOrder
  ): Promise<PlatformApiResult<PlatformOrder>>;
  getOrderById(
    request: Request,
    orderId: PlatformEntityId
  ): Promise<PlatformApiResult<PlatformOrder>>;
  createInvoice(
    request: Request,
    input: PlatformInvoice
  ): Promise<PlatformApiResult<PlatformInvoice>>;
  getInvoiceById(
    request: Request,
    invoiceId: PlatformEntityId
  ): Promise<PlatformApiResult<PlatformInvoice>>;
  runAssistant(
    request: Request,
    input: AssistantRequest
  ): Promise<PlatformApiResult<AssistantResult>>;
  checkout(
    request: Request,
    input: CheckoutRequest
  ): Promise<PlatformApiResult<CheckoutResult>>;
  handleWebhook(
    request: Request,
    event: PlatformWebhookEvent
  ): Promise<PlatformApiResult<PlatformSyncResult>>;
};
