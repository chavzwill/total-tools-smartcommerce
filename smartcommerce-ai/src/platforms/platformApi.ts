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
  InventoryPosition,
  Page,
  PlatformApi,
  PlatformHealth,
  Product,
  ProductMatchInput,
  ProductMatchResult,
  ProductQuery,
  RentalAsset,
  RentalQuery,
  RepairBooking,
} from "./contracts";
import { ApiClient, platformApiClient } from "../apiClient";
import { PLATFORM_ROUTES } from "./routes";

function withQuery(path: string, query?: Record<string, unknown>) {
  if (!query) return path;

  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    params.set(key, String(value));
  });

  const queryString = params.toString();
  return queryString ? `${path}?${queryString}` : path;
}

export class SmartCommercePlatformApi implements PlatformApi {
  constructor(private client: ApiClient = platformApiClient) {}

  getHealth(): Promise<ApiResult<PlatformHealth>> {
    return this.client.get<PlatformHealth>(PLATFORM_ROUTES.health);
  }

  listBranches(): Promise<ApiResult<Branch[]>> {
    return this.client.get<Branch[]>(PLATFORM_ROUTES.branches);
  }

  listCategories(): Promise<ApiResult<Page<Category>>> {
    return this.client.get<Page<Category>>(PLATFORM_ROUTES.categories);
  }

  listProducts(query?: ProductQuery): Promise<ApiResult<Page<Product>>> {
    return this.client.get<Page<Product>>(
      withQuery(PLATFORM_ROUTES.products, query)
    );
  }

  getProduct(productId: string): Promise<ApiResult<Product>> {
    return this.client.get<Product>(PLATFORM_ROUTES.product(productId));
  }

  listInventory(productId: string): Promise<ApiResult<InventoryPosition[]>> {
    return this.client.get<InventoryPosition[]>(
      PLATFORM_ROUTES.inventory(productId)
    );
  }

  listRentalAssets(query?: RentalQuery): Promise<ApiResult<Page<RentalAsset>>> {
    return this.client.get<Page<RentalAsset>>(
      withQuery(PLATFORM_ROUTES.rentals, query)
    );
  }

  createCustomer(input: CreateCustomerInput): Promise<ApiResult<Customer>> {
    return this.client.post<Customer>(PLATFORM_ROUTES.customers, input);
  }

  createSaleRequest(
    input: CreateSaleRequestInput
  ): Promise<ApiResult<CommerceRequest>> {
    return this.client.post<CommerceRequest>(
      PLATFORM_ROUTES.saleRequests,
      input
    );
  }

  createRentalReservation(
    input: CreateRentalReservationInput
  ): Promise<ApiResult<CommerceRequest>> {
    return this.client.post<CommerceRequest>(
      PLATFORM_ROUTES.rentalReservations,
      input
    );
  }

  createRepairBooking(
    input: CreateRepairBookingInput
  ): Promise<ApiResult<RepairBooking>> {
    return this.client.post<RepairBooking>(
      PLATFORM_ROUTES.repairBookings,
      input
    );
  }

  matchProduct(
    input: ProductMatchInput
  ): Promise<ApiResult<ProductMatchResult[]>> {
    return this.client.post<ProductMatchResult[]>(
      PLATFORM_ROUTES.productMatch,
      input
    );
  }
}

export const platformApi = new SmartCommercePlatformApi();
