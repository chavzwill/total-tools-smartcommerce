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
import type { PosAdapterStatus } from "./posAdapter";
import { getActivePosAdapter } from "./posAdapterRegistry";

export class CommerceGateway {
  getAdapterStatus(): Promise<ApiResult<PosAdapterStatus>> {
    return getActivePosAdapter().getStatus();
  }

  getHealth(): Promise<ApiResult<PlatformHealth>> {
    return getActivePosAdapter().getHealth();
  }

  listBranches(): Promise<ApiResult<Branch[]>> {
    return getActivePosAdapter().listBranches();
  }

  listCategories(): Promise<ApiResult<Page<Category>>> {
    return getActivePosAdapter().listCategories();
  }

  listProducts(query?: ProductQuery): Promise<ApiResult<Page<Product>>> {
    return getActivePosAdapter().listProducts(query);
  }

  getProduct(productId: ID): Promise<ApiResult<Product>> {
    return getActivePosAdapter().getProduct(productId);
  }

  listInventory(productId: ID): Promise<ApiResult<InventoryPosition[]>> {
    return getActivePosAdapter().listInventory(productId);
  }

  listRentalAssets(query?: RentalQuery): Promise<ApiResult<Page<RentalAsset>>> {
    return getActivePosAdapter().listRentalAssets(query);
  }

  createCustomer(input: CreateCustomerInput): Promise<ApiResult<Customer>> {
    return getActivePosAdapter().createCustomer(input);
  }

  createSaleRequest(
    input: CreateSaleRequestInput
  ): Promise<ApiResult<CommerceRequest>> {
    return getActivePosAdapter().createSaleRequest(input);
  }

  createRentalReservation(
    input: CreateRentalReservationInput
  ): Promise<ApiResult<CommerceRequest>> {
    return getActivePosAdapter().createRentalReservation(input);
  }

  createRepairBooking(
    input: CreateRepairBookingInput
  ): Promise<ApiResult<RepairBooking>> {
    return getActivePosAdapter().createRepairBooking(input);
  }

  matchProduct(
    input: ProductMatchInput
  ): Promise<ApiResult<ProductMatchResult[]>> {
    return getActivePosAdapter().matchProduct(input);
  }
}

export const commerceGateway = new CommerceGateway();