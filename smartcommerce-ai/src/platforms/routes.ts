import type {
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
  PlatformHealth,
  Product,
  ProductMatchInput,
  ProductMatchResult,
  ProductQuery,
  RentalAsset,
  RentalQuery,
  RepairBooking,
} from "./contracts";

export const PLATFORM_ROUTES = {
  health: "/api/v1/platform/health",

  branches: "/api/v1/branches",

  categories: "/api/v1/categories",

  products: "/api/v1/products",
  product: (productId: string) => `/api/v1/products/${productId}`,
  inventory: (productId: string) =>
    `/api/v1/products/${productId}/inventory`,

  rentals: "/api/v1/rentals",

  customers: "/api/v1/customers",

  saleRequests: "/api/v1/requests/sales",

  rentalReservations: "/api/v1/requests/rentals",

  repairBookings: "/api/v1/requests/repairs",

  productMatch: "/api/v1/ai/product-match",
} as const;

export interface PlatformApiRoutes {
  getHealth(): Promise<PlatformHealth>;

  listBranches(): Promise<Branch[]>;

  listCategories(): Promise<Page<Category>>;

  listProducts(query?: ProductQuery): Promise<Page<Product>>;

  getProduct(productId: string): Promise<Product>;

  listInventory(productId: string): Promise<InventoryPosition[]>;

  listRentalAssets(query?: RentalQuery): Promise<Page<RentalAsset>>;

  createCustomer(input: CreateCustomerInput): Promise<Customer>;

  createSaleRequest(
    input: CreateSaleRequestInput
  ): Promise<CommerceRequest>;

  createRentalReservation(
    input: CreateRentalReservationInput
  ): Promise<CommerceRequest>;

  createRepairBooking(
    input: CreateRepairBookingInput
  ): Promise<RepairBooking>;

  matchProduct(
    input: ProductMatchInput
  ): Promise<ProductMatchResult[]>;
}