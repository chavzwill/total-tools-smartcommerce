export type BranchId = "ocho_rios" | "kingston" | "drax_hall";

export type SyncSource = "pos" | "smartcommerce" | "manual";

export type SyncStatus = "synced" | "pending" | "failed" | "conflict";

export type PlatformRecord = {
  id: string;
  externalId?: string;
  source: SyncSource;
  syncStatus: SyncStatus;
  lastSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type Branch = PlatformRecord & {
  name: string;
  address: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  isActive: boolean;
};

export type ProductType = "sale" | "rental" | "repairable" | "service";

export type ProductCategory = PlatformRecord & {
  name: string;
  slug: string;
  parentId?: string;
  description?: string;
  imageUrl?: string;
  isActive: boolean;
};

export type InventoryStatus =
  | "in_stock"
  | "low_stock"
  | "out_of_stock"
  | "special_order"
  | "unknown";

export type Product = PlatformRecord & {
  sku: string;
  name: string;
  slug: string;
  brand?: string;
  categoryId: string;
  subcategoryId?: string;
  type: ProductType[];
  description?: string;
  imageUrl?: string;
  galleryUrls?: string[];
  price?: number;
  currency: "JMD" | "USD";
  specs?: Record<string, string | number | boolean>;
  tags: string[];
  isActive: boolean;
};

export type BranchInventory = PlatformRecord & {
  productId: string;
  branchId: BranchId;
  quantityAvailable: number;
  quantityReserved?: number;
  status: InventoryStatus;
};

export type RentalRate = {
  daily?: number;
  weekly?: number;
  monthly?: number;
  deposit?: number;
  currency: "JMD" | "USD";
};

export type RentalAsset = PlatformRecord & {
  productId: string;
  branchId: BranchId;
  assetTag?: string;
  serialNumber?: string;
  rates: RentalRate;
  availability: "available" | "reserved" | "rented" | "maintenance" | "unavailable";
  notes?: string;
};

export type Customer = PlatformRecord & {
  firstName?: string;
  lastName?: string;
  companyName?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  customerType: "individual" | "contractor" | "business" | "government";
  posCustomerId?: string;
};

export type CartItemType = "product" | "rental" | "repair" | "service";

export type CartItem = {
  id: string;
  type: CartItemType;
  productId?: string;
  rentalAssetId?: string;
  name: string;
  quantity: number;
  unitPrice?: number;
  rentalStartDate?: string;
  rentalEndDate?: string;
  selectedBranchId?: BranchId;
};

export type CustomerRequestStatus =
  | "draft"
  | "submitted"
  | "sent_to_pos"
  | "accepted"
  | "quoted"
  | "rejected"
  | "completed"
  | "cancelled";

export type CustomerRequest = PlatformRecord & {
  customerId?: string;
  requestType: "sale" | "rental" | "repair" | "quote" | "product_match" | "commercial";
  status: CustomerRequestStatus;
  items: CartItem[];
  notes?: string;
  preferredBranchId?: BranchId;
  posReferenceId?: string;
};

export type RepairBooking = PlatformRecord & {
  customerId?: string;
  productId?: string;
  equipmentName: string;
  issueDescription: string;
  imageUrls?: string[];
  preferredBranchId: BranchId;
  preferredDate?: string;
  status:
    | "requested"
    | "received"
    | "diagnosing"
    | "quoted"
    | "approved"
    | "in_repair"
    | "ready"
    | "collected"
    | "cancelled";
  posRepairId?: string;
};

export type PosSyncDirection = "pull_from_pos" | "push_to_pos";

export type PosSyncEvent = PlatformRecord & {
  direction: PosSyncDirection;
  entity:
    | "product"
    | "category"
    | "inventory"
    | "customer"
    | "sale_request"
    | "rental_request"
    | "repair_booking";
  entityId: string;
  status: SyncStatus;
  message?: string;
  payload?: unknown;
};