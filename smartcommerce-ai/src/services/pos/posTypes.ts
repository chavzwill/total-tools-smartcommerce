import {
  createSmartCommercePlatformApi,
  type ApiClientOptions,
} from "../../apiClient";
import type {
  Branch,
  CommercialQuoteRequest,
  CommerceProduct,
  CustomerAccount,
  InventoryAvailability,
  PlatformApiResult,
  PlatformEntityId,
  PlatformOrder,
  PlatformPage,
  PlatformSyncResult,
  PlatformWebhookEvent,
  ProductCategory,
  RentalAsset,
  RentalReservationRequest,
  RepairJob,
  RepairRequest,
} from "../../platform";
import type { PosAdapterContext } from "../../platform";

export type BranchId = PlatformEntityId;
export type BranchInventory = InventoryAvailability;
export type Customer = CustomerAccount;
export type CustomerRequest = PlatformOrder;
export type PosSyncEvent = PlatformWebhookEvent;
export type Product = CommerceProduct;
export type RepairBooking = RepairJob;

export type PosApiResponse<T> = PlatformApiResult<T>;

export type PosPaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNextPage: boolean;
  cursor?: string;
  nextCursor?: string;
};

export type PosListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  branchId?: BranchId;
  updatedAfter?: string;
  includeInactive?: boolean;
  cursor?: string;
};

export type ProductListParams = PosListParams & {
  categoryId?: string;
  subcategoryId?: string;
  brand?: string;
  tags?: string[];
  inStockOnly?: boolean;
  sku?: string;
  barcode?: string;
};

export type RentalListParams = PosListParams & {
  availability?: RentalAsset["status"];
  productId?: string;
  startDate?: string;
  endDate?: string;
};

export type RepairListParams = PosListParams & {
  customerId?: string;
  status?: RepairBooking["status"];
};

export type CustomerListParams = PosListParams & {
  customerId?: string;
  phone?: string;
  email?: string;
  customerType?: Customer["type"];
};

export type CreateCustomerInput = {
  id?: PlatformEntityId;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  customerType?: Customer["type"];
  taxIdentifier?: string;
};

export type CreateSaleRequestInput = {
  id?: PlatformEntityId;
  customer?: CreateCustomerInput;
  customerId?: string;
  items: PlatformOrder["lines"];
  preferredBranchId?: BranchId;
  notes?: string;
  currency?: string;
};

export type CreateRentalReservationInput = {
  customer?: CreateCustomerInput;
  customerId?: string;
  rentalAssetId?: string;
  productId?: string;
  startDate: string;
  endDate: string;
  pickupBranchId?: BranchId;
  deliveryRequested?: boolean;
  deliveryAddress?: RentalReservationRequest["deliveryAddress"];
  notes?: string;
  quantity?: number;
};

export type CreateRepairBookingInput = {
  customer?: CreateCustomerInput;
  customerId?: string;
  productId?: string;
  equipmentName?: string;
  issueDescription: string;
  imageUrls?: string[];
  preferredBranchId: BranchId;
  preferredDate?: string;
};

export type CreateCommercialRequestInput = {
  customer?: CreateCustomerInput;
  customerId?: string;
  companyName?: string;
  requestDetails: string;
  preferredBranchId?: BranchId;
  items?: PlatformOrder["lines"];
};

export type ProductMatchInput = {
  imageUrl?: string;
  imageFileName?: string;
  textHint?: string;
  preferredBranchId?: BranchId;
};

export type ProductMatchResult = {
  product: Product;
  confidence: number;
  reason: string;
  alternatives: Product[];
  accessories: Product[];
  inventory: BranchInventory[];
};

export type PosHealthStatus = {
  online: boolean;
  apiVersion?: string;
  posName: string;
  checkedAt: string;
  message?: string;
};

export type PosSyncSummary = {
  productsPulled: number;
  categoriesPulled: number;
  inventoryPulled: number;
  customersPulled: number;
  rentalsPulled: number;
  repairsPulled: number;
  requestsPushed: number;
  failed: number;
  lastSyncedAt?: string;
};

export type PosConnector = {
  getHealth(): Promise<PosApiResponse<PosHealthStatus>>;

  listBranches(): Promise<PosApiResponse<Branch[]>>;

  listCategories(
    params?: PosListParams
  ): Promise<PosApiResponse<PosPaginatedResponse<ProductCategory>>>;

  listProducts(
    params?: ProductListParams
  ): Promise<PosApiResponse<PosPaginatedResponse<Product>>>;

  getProduct(productId: string): Promise<PosApiResponse<Product>>;

  listInventory(
    params?: PosListParams
  ): Promise<PosApiResponse<PosPaginatedResponse<BranchInventory>>>;

  listRentalAssets(
    params?: RentalListParams
  ): Promise<PosApiResponse<PosPaginatedResponse<RentalAsset>>>;

  createCustomer(input: CreateCustomerInput): Promise<PosApiResponse<Customer>>;

  findCustomers(
    params?: CustomerListParams
  ): Promise<PosApiResponse<PosPaginatedResponse<Customer>>>;

  createSaleRequest(
    input: CreateSaleRequestInput
  ): Promise<PosApiResponse<CustomerRequest>>;

  createRentalReservation(
    input: CreateRentalReservationInput
  ): Promise<PosApiResponse<CustomerRequest>>;

  createRepairBooking(
    input: CreateRepairBookingInput
  ): Promise<PosApiResponse<RepairBooking>>;

  createCommercialRequest(
    input: CreateCommercialRequestInput
  ): Promise<PosApiResponse<CustomerRequest>>;

  matchProductFromImage(
    input: ProductMatchInput
  ): Promise<PosApiResponse<ProductMatchResult[]>>;

  syncAll(): Promise<PosApiResponse<PosSyncSummary>>;

  listSyncEvents(
    params?: PosListParams
  ): Promise<PosApiResponse<PosPaginatedResponse<PosSyncEvent>>>;
};

export type ProductionPosConnectorOptions = ApiClientOptions & {
  context: PosAdapterContext;
};

const unsupported = <T>(operation: string): PosApiResponse<T> => ({
  success: false,
  error: {
    code: "POS_OPERATION_NOT_AVAILABLE",
    message: `${operation} is not available through the production platform API yet.`,
  },
});

const validationError = <T>(message: string): PosApiResponse<T> => ({
  success: false,
  error: {
    code: "POS_VALIDATION_ERROR",
    message,
  },
});

const toRequiredPage = <T>(
  page: PlatformPage<T>,
  params?: PosListParams
): PosPaginatedResponse<T> => ({
  items: page.items,
  total: page.total ?? page.items.length,
  page: page.page ?? params?.page ?? 1,
  pageSize: page.pageSize ?? params?.pageSize ?? page.items.length,
  hasNextPage: page.hasNextPage,
  cursor: page.cursor,
  nextCursor: page.nextCursor,
});

const mapPageResult = <T>(
  result: PosApiResponse<PlatformPage<T>>,
  params?: PosListParams
): PosApiResponse<PosPaginatedResponse<T>> => {
  if (!result.success) return result;

  return {
    ...result,
    data: toRequiredPage(result.data, params),
  };
};

const createCustomerAccount = (
  input: CreateCustomerInput,
  businessAccountId: PlatformEntityId
): CustomerAccount | PosApiResponse<CustomerAccount> => {
  if (!input.id) {
    return validationError<CustomerAccount>(
      "Customer creation requires an id supplied by the caller or upstream identity service."
    );
  }

  return {
    id: input.id,
    businessAccountId,
    type: input.customerType,
    firstName: input.firstName,
    lastName: input.lastName,
    companyName: input.companyName,
    email: input.email,
    phone: input.phone,
    taxIdentifier: input.taxIdentifier,
  };
};

export function createProductionPosConnector(
  options: ProductionPosConnectorOptions
): PosConnector {
  const api = createSmartCommercePlatformApi(options);
  const { context } = options;

  return {
    async getHealth() {
      const result = await api.healthCheck();

      if (!result.success) return result;

      return {
        ...result,
        data: {
          online: result.data.connected,
          apiVersion: result.data.apiVersion,
          posName: result.data.displayName || result.data.providerId,
          checkedAt: result.data.checkedAt,
          message: result.data.message,
        },
      };
    },

    listBranches() {
      return api.listBranches();
    },

    async listCategories(params) {
      return mapPageResult(await api.listCategories(), params);
    },

    async listProducts(params) {
      return mapPageResult(
        await api.searchProducts({
          search: params?.search,
          categoryId: params?.categoryId,
          branchId: params?.branchId,
          sku: params?.sku,
          barcode: params?.barcode,
          tags: params?.tags,
          includeInactive: params?.includeInactive,
          page: params?.page,
          pageSize: params?.pageSize,
          cursor: params?.cursor,
        }),
        params
      );
    },

    getProduct(productId) {
      return api.getProductById(productId);
    },

    async listInventory(params) {
      if (!params?.search) {
        return validationError<PosPaginatedResponse<BranchInventory>>(
          "Inventory lookup requires params.search to contain the product id until product-specific inventory queries are wired."
        );
      }

      const result = await api.getInventoryAvailability({
        productId: params.search,
        branchId: params.branchId,
      });

      if (!result.success) return result;

      return {
        ...result,
        data: {
          items: result.data,
          total: result.data.length,
          page: params.page ?? 1,
          pageSize: params.pageSize ?? result.data.length,
          hasNextPage: false,
        },
      };
    },

    async listRentalAssets(params) {
      return mapPageResult(
        await api.listRentalAssets({
          productId: params?.productId,
          branchId: params?.branchId,
          status: params?.availability,
          startDate: params?.startDate,
          endDate: params?.endDate,
          page: params?.page,
          pageSize: params?.pageSize,
          cursor: params?.cursor,
        }),
        params
      );
    },

    createCustomer(input) {
      const customer = createCustomerAccount(
        input,
        context.businessAccountId
      );

      if ("success" in customer) return Promise.resolve(customer);

      return api.createCustomer(customer);
    },

    async findCustomers(params) {
      if (!params?.customerId) {
        return Promise.resolve(
          unsupported<PosPaginatedResponse<Customer>>(
            "findCustomers without customerId"
          )
        );
      }

      const result = await api.getCustomerById(params.customerId);

      if (!result.success) return result;

      return {
        ...result,
        data: {
          items: [result.data],
          total: 1,
          page: params.page ?? 1,
          pageSize: params.pageSize ?? 1,
          hasNextPage: false,
        },
      };
    },

    createSaleRequest(input) {
      if (!input.id) {
        return Promise.resolve(
          validationError<CustomerRequest>(
            "Sale request creation requires an order id supplied by the caller."
          )
        );
      }

      return api.createOrder({
        id: input.id,
        businessAccountId: context.businessAccountId,
        customerAccountId: input.customerId,
        branchId: input.preferredBranchId,
        status: "submitted",
        currency: input.currency || "JMD",
        lines: input.items,
        metadata: input.notes ? { notes: input.notes } : undefined,
      });
    },

    async createRentalReservation(input) {
      const result = await api.createRentalReservation({
        businessAccountId: context.businessAccountId,
        customerAccountId: input.customerId,
        rentalAssetId: input.rentalAssetId,
        productId: input.productId,
        branchId: input.pickupBranchId,
        startDate: input.startDate,
        endDate: input.endDate,
        quantity: input.quantity,
        deliveryRequested: input.deliveryRequested,
        deliveryAddress: input.deliveryAddress,
        customerNotes: input.notes,
      });

      if (!result.success) return result;

      return {
        ...result,
        data: {
          id: result.data.id,
          businessAccountId: result.data.businessAccountId,
          customerAccountId: result.data.customerAccountId,
          branchId: input.pickupBranchId,
          status: "submitted",
          currency: "JMD",
          lines: [
            {
              rentalAssetId: result.data.rentalAssetId,
              productId: result.data.productId,
              description: "Rental reservation",
              quantity: input.quantity ?? 1,
            },
          ],
          externalRefs: result.data.externalRefs,
          metadata: result.data.metadata,
        },
      };
    },

    createRepairBooking(input) {
      const request: RepairRequest = {
        businessAccountId: context.businessAccountId,
        customerAccountId: input.customerId,
        productId: input.productId,
        branchId: input.preferredBranchId,
        equipmentName: input.equipmentName,
        issueDescription: input.issueDescription,
        imageUrls: input.imageUrls,
        preferredDate: input.preferredDate,
      };

      return api.createRepairRequest(request);
    },

    async createCommercialRequest(input) {
      const request: CommercialQuoteRequest = {
        businessAccountId: context.businessAccountId,
        customerAccountId: input.customerId,
        companyName: input.companyName,
        branchId: input.preferredBranchId,
        requestDetails: input.requestDetails,
        requestedItems: input.items?.map((item) => ({
          productId: item.productId,
          name: item.description,
          quantity: item.quantity,
        })),
      };

      const result = await api.createCommercialQuote(request);

      if (!result.success) return result;

      return {
        ...result,
        data: {
          id: result.data.id,
          businessAccountId: result.data.businessAccountId,
          customerAccountId: result.data.customerAccountId,
          status: "submitted",
          currency: result.data.currency || "JMD",
          lines:
            input.items?.map((item) => ({
              ...item,
              description: item.description || "Commercial quote item",
            })) || [],
          totalAmount: result.data.totalAmount,
          externalRefs: result.data.externalRefs,
          metadata: result.data.metadata,
        },
      };
    },

    matchProductFromImage() {
      return Promise.resolve(
        unsupported<ProductMatchResult[]>("matchProductFromImage")
      );
    },

    async syncAll() {
      const result = await api.handleWebhook({
        providerId: context.providerId,
        businessAccountId: context.businessAccountId,
        eventType: "platform.sync.requested",
        payload: {},
      });

      if (!result.success) return result;

      return {
        ...result,
        data: toSyncSummary(result.data),
      };
    },

    listSyncEvents() {
      return Promise.resolve(
        unsupported<PosPaginatedResponse<PosSyncEvent>>("listSyncEvents")
      );
    },
  };
}

function toSyncSummary(result: PlatformSyncResult): PosSyncSummary {
  return {
    productsPulled: 0,
    categoriesPulled: 0,
    inventoryPulled: 0,
    customersPulled: 0,
    rentalsPulled: 0,
    repairsPulled: 0,
    requestsPushed:
      (result.recordsCreated ?? 0) + (result.recordsUpdated ?? 0),
    failed: result.recordsFailed ?? 0,
    lastSyncedAt: result.completedAt,
  };
}
