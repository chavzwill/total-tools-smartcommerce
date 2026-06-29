import type {
  ApiResult,
  Branch,
  Category,
  CommerceRequest,
  CreateCustomerInput,
  CreateRentalReservationInput,
  CreateRepairBookingInput,
  CreateSaleRequestInput,
  Customer,
  ID,
  InventoryPosition,
  Page,
  PlatformHealth,
  Product,
  ProductMatchInput,
  ProductMatchResult,
  ProductQuery,
  RentalAsset,
  RentalQuery,
  RepairBooking,
} from "./contracts";

export type PosAdapterName =
  | "custom_pos"
  | "lightspeed"
  | "square"
  | "shopify"
  | "quickbooks"
  | "manual"
  | "unknown";

export type PosAdapterConfig = {
  name: PosAdapterName;
  displayName: string;
  baseUrl?: string;
  apiKey?: string;
  tenantId?: string;
  branchMap?: Record<string, string>;
  productFieldMap?: Record<string, string>;
  inventoryFieldMap?: Record<string, string>;
};

export type PosAdapterCapability =
  | "products"
  | "categories"
  | "inventory"
  | "customers"
  | "sales_requests"
  | "rentals"
  | "repairs"
  | "commercial_requests"
  | "product_match"
  | "webhooks"
  | "real_time_stock"
  | "pricing_rules";

export type PosAdapterStatus = {
  name: PosAdapterName;
  displayName: string;
  connected: boolean;
  capabilities: PosAdapterCapability[];
  lastCheckedAt: string;
  message?: string;
};

export type PosAdapterSyncResult = {
  productsUpdated: number;
  categoriesUpdated: number;
  inventoryUpdated: number;
  customersUpdated: number;
  rentalsUpdated: number;
  repairsUpdated: number;
  requestsPushed: number;
  failed: number;
  messages: string[];
  syncedAt: string;
};

export interface PosAdapter {
  getStatus(): Promise<ApiResult<PosAdapterStatus>>;
  getHealth(): Promise<ApiResult<PlatformHealth>>;

  listBranches(): Promise<ApiResult<Branch[]>>;
  listCategories(): Promise<ApiResult<Page<Category>>>;
  listProducts(query?: ProductQuery): Promise<ApiResult<Page<Product>>>;
  getProduct(productId: ID): Promise<ApiResult<Product>>;
  listInventory(productId: ID): Promise<ApiResult<InventoryPosition[]>>;

  listRentalAssets(query?: RentalQuery): Promise<ApiResult<Page<RentalAsset>>>;

  createCustomer(input: CreateCustomerInput): Promise<ApiResult<Customer>>;
  createSaleRequest(input: CreateSaleRequestInput): Promise<ApiResult<CommerceRequest>>;
  createRentalReservation(input: CreateRentalReservationInput): Promise<ApiResult<CommerceRequest>>;
  createRepairBooking(input: CreateRepairBookingInput): Promise<ApiResult<RepairBooking>>;

  matchProduct(input: ProductMatchInput): Promise<ApiResult<ProductMatchResult[]>>;

  syncFromPos(): Promise<ApiResult<PosAdapterSyncResult>>;
  pushPendingRequests(): Promise<ApiResult<PosAdapterSyncResult>>;
}

export function createUnsupportedAdapter(
  config: PosAdapterConfig
): PosAdapter {
  const unsupported = async <T>(operation: string): Promise<ApiResult<T>> => ({
    success: false,
    error: {
      code: "POS_ADAPTER_NOT_IMPLEMENTED",
      message: `${operation} is not implemented for ${config.displayName}.`,
      details: { adapter: config.name },
    },
  });

  return {
    getStatus: async () => ({
      success: true,
      data: {
        name: config.name,
        displayName: config.displayName,
        connected: false,
        capabilities: [],
        lastCheckedAt: new Date().toISOString(),
        message: "POS adapter has not been implemented yet.",
      },
    }),

    getHealth: () => unsupported("getHealth"),
    listBranches: () => unsupported("listBranches"),
    listCategories: () => unsupported("listCategories"),
    listProducts: () => unsupported("listProducts"),
    getProduct: () => unsupported("getProduct"),
    listInventory: () => unsupported("listInventory"),
    listRentalAssets: () => unsupported("listRentalAssets"),
    createCustomer: () => unsupported("createCustomer"),
    createSaleRequest: () => unsupported("createSaleRequest"),
    createRentalReservation: () => unsupported("createRentalReservation"),
    createRepairBooking: () => unsupported("createRepairBooking"),
    matchProduct: () => unsupported("matchProduct"),
    syncFromPos: () => unsupported("syncFromPos"),
    pushPendingRequests: () => unsupported("pushPendingRequests"),
  };
}