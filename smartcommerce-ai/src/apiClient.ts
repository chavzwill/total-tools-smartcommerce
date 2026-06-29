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
  PlatformMetadata,
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
} from "./platform";
import type { RepairType } from "./types";
import {
  SmartCommercePlatformApi,
  type InventoryAvailabilityQuery,
  type PosAdapter,
  type PosAdapterContext,
  type PosAdapterHealthStatus,
  type ProductSearchQuery,
  type RentalAssetQuery,
  type RentalAvailabilityQuery,
} from "./platform";

export type ApiClientOptions = {
  baseUrl?: string;
  getAccessToken?: () => string | undefined;
  defaultHeaders?: Record<string, string>;
};

export type CreatePlatformApiOptions = ApiClientOptions & {
  context: PosAdapterContext;
};

export type PlatformSyncScope = "products" | "rentals" | "repairs";

export type PlatformSyncRequest = {
  scope: PlatformSyncScope;
  fullSync?: boolean;
  updatedAfter?: string;
  metadata?: PlatformMetadata;
};

const DEFAULT_API_BASE_URL = "/api";

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const withQuery = (path: string, query?: Record<string, unknown>) => {
  if (!query) return path;

  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;

    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== undefined && item !== null && item !== "") {
          params.append(key, String(item));
        }
      });
      return;
    }

    if (typeof value === "object") return;

    params.set(key, String(value));
  });

  const queryString = params.toString();
  return queryString ? `${path}?${queryString}` : path;
};

export class ApiClient {
  private baseUrl: string;
  private getAccessToken?: () => string | undefined;
  private defaultHeaders: Record<string, string>;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = trimTrailingSlash(
      options.baseUrl ||
        import.meta.env.VITE_SMARTCOMMERCE_API_URL ||
        DEFAULT_API_BASE_URL
    );
    this.getAccessToken = options.getAccessToken;
    this.defaultHeaders = options.defaultHeaders || {};
  }

  get<T>(
    path: string,
    context?: PosAdapterContext
  ): Promise<PlatformApiResult<T>> {
    return this.request<T>("GET", path, undefined, context);
  }

  post<T>(
    path: string,
    body?: unknown,
    context?: PosAdapterContext
  ): Promise<PlatformApiResult<T>> {
    return this.request<T>("POST", path, body, context);
  }

  put<T>(
    path: string,
    body?: unknown,
    context?: PosAdapterContext
  ): Promise<PlatformApiResult<T>> {
    return this.request<T>("PUT", path, body, context);
  }

  delete<T>(
    path: string,
    context?: PosAdapterContext
  ): Promise<PlatformApiResult<T>> {
    return this.request<T>("DELETE", path, undefined, context);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    context?: PosAdapterContext
  ): Promise<PlatformApiResult<T>> {
    const token = this.getAccessToken?.();

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...this.defaultHeaders,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(context?.businessAccountId
            ? { "X-Business-Account-Id": context.businessAccountId }
            : {}),
          ...(context?.providerId ? { "X-Provider-Id": context.providerId } : {}),
          ...(context?.connectionId
            ? { "X-Connection-Id": context.connectionId }
            : {}),
          ...(context?.actorId ? { "X-Actor-Id": context.actorId } : {}),
          ...(context?.requestId ? { "X-Request-Id": context.requestId } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        return {
          success: false,
          error: {
            code: data?.error?.code || `HTTP_${response.status}`,
            message:
              data?.error?.message ||
              response.statusText ||
              "SmartCommerce platform request failed.",
            details: data?.error?.details || data,
            retryable: response.status >= 500,
          },
          requestId:
            data?.requestId ||
            response.headers.get("X-Request-Id") ||
            context?.requestId,
        };
      }

      return data as PlatformApiResult<T>;
    } catch (error) {
      return {
        success: false,
        error: {
          code: "NETWORK_ERROR",
          message: "Unable to connect to the SmartCommerce platform API.",
          details: error,
          retryable: true,
        },
        requestId: context?.requestId,
      };
    }
  }
}

export class HttpPosAdapter implements PosAdapter {
  constructor(private client: ApiClient = new ApiClient()) {}

  healthCheck(
    context: PosAdapterContext
  ): Promise<PlatformApiResult<PosAdapterHealthStatus>> {
    return this.client.get<PosAdapterHealthStatus>(
      "/platform/integrations/health",
      context
    );
  }

  listBranches(context: PosAdapterContext): Promise<PlatformApiResult<Branch[]>> {
    return this.client.get<Branch[]>("/platform/branches", context);
  }

  listCategories(
    context: PosAdapterContext
  ): Promise<PlatformApiResult<PlatformPage<ProductCategory>>> {
    return this.client.get<PlatformPage<ProductCategory>>(
      "/platform/categories",
      context
    );
  }

  searchProducts(
    context: PosAdapterContext,
    query?: ProductSearchQuery
  ): Promise<PlatformApiResult<PlatformPage<CommerceProduct>>> {
    return this.client.get<PlatformPage<CommerceProduct>>(
      withQuery("/platform/products", query),
      context
    );
  }

  getProductById(
    context: PosAdapterContext,
    productId: PlatformEntityId
  ): Promise<PlatformApiResult<CommerceProduct>> {
    return this.client.get<CommerceProduct>(
      `/platform/products/${encodeURIComponent(productId)}`,
      context
    );
  }

  getInventoryAvailability(
    context: PosAdapterContext,
    query: InventoryAvailabilityQuery
  ): Promise<PlatformApiResult<InventoryAvailability[]>> {
    return this.client.get<InventoryAvailability[]>(
      withQuery("/platform/inventory/availability", query),
      context
    );
  }

  listRentalAssets(
    context: PosAdapterContext,
    query?: RentalAssetQuery
  ): Promise<PlatformApiResult<PlatformPage<RentalAsset>>> {
    return this.client.get<PlatformPage<RentalAsset>>(
      withQuery("/platform/rentals/assets", query),
      context
    );
  }

  getRentalAssetById(
    context: PosAdapterContext,
    rentalAssetId: PlatformEntityId
  ): Promise<PlatformApiResult<RentalAsset>> {
    return this.client.get<RentalAsset>(
      `/platform/rentals/assets/${encodeURIComponent(rentalAssetId)}`,
      context
    );
  }

  getRentalAvailability(
    context: PosAdapterContext,
    query: RentalAvailabilityQuery
  ): Promise<PlatformApiResult<InventoryAvailability[]>> {
    return this.client.get<InventoryAvailability[]>(
      withQuery("/platform/rentals/availability", query),
      context
    );
  }

  createRentalReservation(
    context: PosAdapterContext,
    request: RentalReservationRequest
  ): Promise<PlatformApiResult<RentalReservationResult>> {
    return this.client.post<RentalReservationResult>(
      "/platform/rentals/reservations",
      request,
      context
    );
  }

  createRepairRequest(
    context: PosAdapterContext,
    request: RepairRequest
  ): Promise<PlatformApiResult<RepairJob>> {
    return this.client.post<RepairJob>(
      "/platform/repairs/requests",
      request,
      context
    );
  }

  getRepairJobById(
    context: PosAdapterContext,
    repairJobId: PlatformEntityId
  ): Promise<PlatformApiResult<RepairJob>> {
    return this.client.get<RepairJob>(
      `/platform/repairs/jobs/${encodeURIComponent(repairJobId)}`,
      context
    );
  }

  createCommercialQuote(
    context: PosAdapterContext,
    request: CommercialQuoteRequest
  ): Promise<PlatformApiResult<CommercialQuoteResult>> {
    return this.client.post<CommercialQuoteResult>(
      "/platform/commercial/quotes",
      request,
      context
    );
  }

  createCustomer(
    context: PosAdapterContext,
    customer: CustomerAccount
  ): Promise<PlatformApiResult<CustomerAccount>> {
    return this.client.post<CustomerAccount>(
      "/platform/customers",
      customer,
      context
    );
  }

  getCustomerById(
    context: PosAdapterContext,
    customerId: PlatformEntityId
  ): Promise<PlatformApiResult<CustomerAccount>> {
    return this.client.get<CustomerAccount>(
      `/platform/customers/${encodeURIComponent(customerId)}`,
      context
    );
  }

  createOrder(
    context: PosAdapterContext,
    order: PlatformOrder
  ): Promise<PlatformApiResult<PlatformOrder>> {
    return this.client.post<PlatformOrder>("/platform/orders", order, context);
  }

  getOrderById(
    context: PosAdapterContext,
    orderId: PlatformEntityId
  ): Promise<PlatformApiResult<PlatformOrder>> {
    return this.client.get<PlatformOrder>(
      `/platform/orders/${encodeURIComponent(orderId)}`,
      context
    );
  }

  createInvoice(
    context: PosAdapterContext,
    invoice: PlatformInvoice
  ): Promise<PlatformApiResult<PlatformInvoice>> {
    return this.client.post<PlatformInvoice>(
      "/platform/invoices",
      invoice,
      context
    );
  }

  handleWebhook(
    context: PosAdapterContext,
    event: PlatformWebhookEvent
  ): Promise<PlatformApiResult<PlatformSyncResult>> {
    return this.client.post<PlatformSyncResult>(
      "/platform/integrations/webhooks",
      event,
      context
    );
  }
}

export class ProductionSyncClient {
  constructor(private client: ApiClient = new ApiClient()) {}

  syncProducts(
    context: PosAdapterContext,
    request: Omit<PlatformSyncRequest, "scope"> = {}
  ): Promise<PlatformApiResult<PlatformSyncResult>> {
    return this.client.post<PlatformSyncResult>(
      "/platform/sync/products",
      { ...request, scope: "products" },
      context
    );
  }

  syncRentals(
    context: PosAdapterContext,
    request: Omit<PlatformSyncRequest, "scope"> = {}
  ): Promise<PlatformApiResult<PlatformSyncResult>> {
    return this.client.post<PlatformSyncResult>(
      "/platform/sync/rentals",
      { ...request, scope: "rentals" },
      context
    );
  }

  syncRepairs(
    context: PosAdapterContext,
    request: Omit<PlatformSyncRequest, "scope"> = {}
  ): Promise<PlatformApiResult<PlatformSyncResult>> {
    return this.client.post<PlatformSyncResult>(
      "/platform/sync/repairs",
      { ...request, scope: "repairs" },
      context
    );
  }

  listRepairCatalog(
    context: PosAdapterContext
  ): Promise<PlatformApiResult<PlatformPage<RepairType>>> {
    return this.client.get<PlatformPage<RepairType>>(
      "/platform/repairs/catalog",
      context
    );
  }

  createProduct(
    context: PosAdapterContext,
    product: CommerceProduct
  ): Promise<PlatformApiResult<CommerceProduct>> {
    return this.client.post<CommerceProduct>(
      "/platform/products",
      product,
      context
    );
  }

  updateProduct(
    context: PosAdapterContext,
    productId: PlatformEntityId,
    product: Partial<CommerceProduct>
  ): Promise<PlatformApiResult<CommerceProduct>> {
    return this.client.put<CommerceProduct>(
      `/platform/products/${encodeURIComponent(productId)}`,
      product,
      context
    );
  }

  deleteProduct(
    context: PosAdapterContext,
    productId: PlatformEntityId
  ): Promise<PlatformApiResult<{ id: PlatformEntityId }>> {
    return this.client.delete<{ id: PlatformEntityId }>(
      `/platform/products/${encodeURIComponent(productId)}`,
      context
    );
  }

  createRentalAsset(
    context: PosAdapterContext,
    rentalAsset: RentalAsset
  ): Promise<PlatformApiResult<RentalAsset>> {
    return this.client.post<RentalAsset>(
      "/platform/rentals/assets",
      rentalAsset,
      context
    );
  }

  updateRentalAsset(
    context: PosAdapterContext,
    rentalAssetId: PlatformEntityId,
    rentalAsset: Partial<RentalAsset>
  ): Promise<PlatformApiResult<RentalAsset>> {
    return this.client.put<RentalAsset>(
      `/platform/rentals/assets/${encodeURIComponent(rentalAssetId)}`,
      rentalAsset,
      context
    );
  }

  deleteRentalAsset(
    context: PosAdapterContext,
    rentalAssetId: PlatformEntityId
  ): Promise<PlatformApiResult<{ id: PlatformEntityId }>> {
    return this.client.delete<{ id: PlatformEntityId }>(
      `/platform/rentals/assets/${encodeURIComponent(rentalAssetId)}`,
      context
    );
  }

  createRepairCatalogItem(
    context: PosAdapterContext,
    repairType: RepairType
  ): Promise<PlatformApiResult<RepairType>> {
    return this.client.post<RepairType>(
      "/platform/repairs/catalog",
      repairType,
      context
    );
  }

  updateRepairCatalogItem(
    context: PosAdapterContext,
    repairTypeId: PlatformEntityId,
    repairType: Partial<RepairType>
  ): Promise<PlatformApiResult<RepairType>> {
    return this.client.put<RepairType>(
      `/platform/repairs/catalog/${encodeURIComponent(repairTypeId)}`,
      repairType,
      context
    );
  }

  deleteRepairCatalogItem(
    context: PosAdapterContext,
    repairTypeId: PlatformEntityId
  ): Promise<PlatformApiResult<{ id: PlatformEntityId }>> {
    return this.client.delete<{ id: PlatformEntityId }>(
      `/platform/repairs/catalog/${encodeURIComponent(repairTypeId)}`,
      context
    );
  }
}

export function createSmartCommercePlatformApi(
  options: CreatePlatformApiOptions
) {
  const client = new ApiClient(options);
  const adapter = new HttpPosAdapter(client);

  return new SmartCommercePlatformApi({
    adapter,
    context: options.context,
  });
}

export function createApiClient(options?: ApiClientOptions) {
  return new ApiClient(options);
}

export function createProductionSyncClient(options?: ApiClientOptions) {
  return new ProductionSyncClient(new ApiClient(options));
}

export const platformApiClient = new ApiClient();
export const productionSyncClient = new ProductionSyncClient(platformApiClient);

export type { PlatformMetadata };
