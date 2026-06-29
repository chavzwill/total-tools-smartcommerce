export type ID = string;
export type ISODate = string;
export type CurrencyCode = "JMD" | "USD";

export type BranchCode = "OCHO_RIOS" | "KINGSTON" | "DRAX_HALL";

export type ApiResult<T> =
  | { success: true; data: T; requestId?: string }
  | {
      success: false;
      error: {
        code: string;
        message: string;
        details?: unknown;
      };
      requestId?: string;
    };

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export type Branch = {
  id: ID;
  code: BranchCode;
  name: string;
  address: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  active: boolean;
};

export type ProductStatus = "active" | "inactive" | "discontinued";
export type ProductUse = "sale" | "rental" | "repairable" | "service";

export type Category = {
  id: ID;
  parentId?: ID;
  name: string;
  slug: string;
  imageUrl?: string;
  active: boolean;
};

export type Product = {
  id: ID;
  sku: string;
  barcode?: string;
  name: string;
  slug: string;
  brand?: string;
  categoryId: ID;
  subcategoryId?: ID;
  uses: ProductUse[];
  description?: string;
  imageUrl?: string;
  galleryUrls?: string[];
  currency: CurrencyCode;
  retailPrice?: number;
  commercialPrice?: number;
  taxRate?: number;
  specs?: Record<string, string | number | boolean>;
  tags: string[];
  status: ProductStatus;
  updatedAt: ISODate;
};

export type InventoryStatus =
  | "in_stock"
  | "low_stock"
  | "out_of_stock"
  | "reserved"
  | "unknown";

export type InventoryPosition = {
  id: ID;
  productId: ID;
  branchCode: BranchCode;
  quantityOnHand: number;
  quantityAvailable: number;
  quantityReserved: number;
  status: InventoryStatus;
  updatedAt: ISODate;
};

export type CustomerType = "individual" | "contractor" | "business" | "government";

export type Customer = {
  id: ID;
  posCustomerId?: ID;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  type: CustomerType;
  createdAt: ISODate;
  updatedAt: ISODate;
};

export type CartLineKind = "sale" | "rental" | "repair" | "service";

export type CartLine = {
  id: ID;
  kind: CartLineKind;
  productId?: ID;
  rentalAssetId?: ID;
  name: string;
  quantity: number;
  unitPrice?: number;
  branchCode?: BranchCode;
  rentalStart?: ISODate;
  rentalEnd?: ISODate;
};

export type RentalAvailability = "available" | "reserved" | "rented" | "maintenance" | "unavailable";

export type RentalRate = {
  currency: CurrencyCode;
  daily?: number;
  weekly?: number;
  monthly?: number;
  deposit?: number;
};

export type RentalAsset = {
  id: ID;
  productId: ID;
  branchCode: BranchCode;
  assetTag?: string;
  serialNumber?: string;
  rate: RentalRate;
  availability: RentalAvailability;
  updatedAt: ISODate;
};

export type RequestStatus =
  | "draft"
  | "submitted"
  | "sent_to_pos"
  | "accepted"
  | "quoted"
  | "rejected"
  | "completed"
  | "cancelled";

export type CommerceRequestType =
  | "sale"
  | "rental"
  | "repair"
  | "quote"
  | "product_match"
  | "commercial";

export type CommerceRequest = {
  id: ID;
  type: CommerceRequestType;
  status: RequestStatus;
  customerId?: ID;
  lines: CartLine[];
  preferredBranchCode?: BranchCode;
  notes?: string;
  posReferenceId?: ID;
  createdAt: ISODate;
  updatedAt: ISODate;
};

export type RepairStatus =
  | "requested"
  | "received"
  | "diagnosing"
  | "quoted"
  | "approved"
  | "in_repair"
  | "ready"
  | "collected"
  | "cancelled";

export type RepairBooking = {
  id: ID;
  customerId?: ID;
  productId?: ID;
  equipmentName: string;
  issueDescription: string;
  imageUrls?: string[];
  preferredBranchCode: BranchCode;
  preferredDate?: ISODate;
  status: RepairStatus;
  posRepairId?: ID;
  createdAt: ISODate;
  updatedAt: ISODate;
};

export type CreateCustomerInput = Omit<Customer, "id" | "createdAt" | "updatedAt">;

export type CreateSaleRequestInput = {
  customer?: CreateCustomerInput;
  customerId?: ID;
  lines: CartLine[];
  preferredBranchCode?: BranchCode;
  notes?: string;
};

export type CreateRentalReservationInput = {
  customer?: CreateCustomerInput;
  customerId?: ID;
  productId: ID;
  rentalAssetId?: ID;
  startDate: ISODate;
  endDate: ISODate;
  branchCode: BranchCode;
  deliveryRequested?: boolean;
  deliveryAddress?: string;
  notes?: string;
};

export type CreateRepairBookingInput = {
  customer?: CreateCustomerInput;
  customerId?: ID;
  productId?: ID;
  equipmentName: string;
  issueDescription: string;
  imageUrls?: string[];
  preferredBranchCode: BranchCode;
  preferredDate?: ISODate;
};

export type ProductMatchInput = {
  imageUrl?: string;
  imageFileName?: string;
  textHint?: string;
  preferredBranchCode?: BranchCode;
};

export type ProductMatchResult = {
  product: Product;
  confidence: number;
  reason: string;
  alternatives: Product[];
  accessories: Product[];
  inventory: InventoryPosition[];
};

export type PlatformHealth = {
  online: boolean;
  serviceName: string;
  apiVersion: string;
  checkedAt: ISODate;
  message?: string;
};

export type ProductQuery = {
  search?: string;
  categoryId?: ID;
  subcategoryId?: ID;
  brand?: string;
  branchCode?: BranchCode;
  inStockOnly?: boolean;
  page?: number;
  pageSize?: number;
};

export type RentalQuery = {
  search?: string;
  branchCode?: BranchCode;
  availability?: RentalAvailability;
  page?: number;
  pageSize?: number;
};

export type PlatformApi = {
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
};