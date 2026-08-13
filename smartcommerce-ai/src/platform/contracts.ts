export type CurrencyCode = string;

export type PlatformEntityId = string;

export type ISODateTime = string;

export type PlatformMetadata = Record<string, string | number | boolean | null>;

export type ExternalSystemReference = {
  providerId: string;
  externalId: string;
  externalType?: string;
  metadata?: PlatformMetadata;
};

export type PlatformApiError = {
  code: string;
  message: string;
  details?: unknown;
  retryable?: boolean;
};

export type PlatformApiResult<T> =
  | {
      success: true;
      data: T;
      requestId?: string;
      syncedAt?: ISODateTime;
    }
  | {
      success: false;
      error: PlatformApiError;
      requestId?: string;
    };

export type PlatformPage<T> = {
  items: T[];
  total?: number;
  page?: number;
  pageSize?: number;
  cursor?: string;
  nextCursor?: string;
  hasNextPage: boolean;
};

export type Branch = {
  id: PlatformEntityId;
  businessAccountId: PlatformEntityId;
  name: string;
  code?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    countryCode?: string;
  };
  phone?: string;
  email?: string;
  timezone?: string;
  active: boolean;
  externalRefs?: ExternalSystemReference[];
  metadata?: PlatformMetadata;
};

export type BusinessAccount = {
  id: PlatformEntityId;
  displayName: string;
  legalName?: string;
  tenantKey?: string;
  defaultCurrency?: CurrencyCode;
  timezone?: string;
  locale?: string;
  taxIdentifiers?: string[];
  active: boolean;
  externalRefs?: ExternalSystemReference[];
  metadata?: PlatformMetadata;
};

export type CustomerAccount = {
  id: PlatformEntityId;
  businessAccountId: PlatformEntityId;
  type?: "individual" | "business" | "government" | "contractor" | string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  email?: string;
  phone?: string;
  taxIdentifier?: string;
  billingAddress?: Branch["address"];
  shippingAddress?: Branch["address"];
  externalRefs?: ExternalSystemReference[];
  metadata?: PlatformMetadata;
};

export type ProductCategory = {
  id: PlatformEntityId;
  businessAccountId: PlatformEntityId;
  parentId?: PlatformEntityId;
  name: string;
  slug?: string;
  description?: string;
  active: boolean;
  externalRefs?: ExternalSystemReference[];
  metadata?: PlatformMetadata;
};

export type ProductImage = {
  id?: PlatformEntityId;
  url: string;
  altText?: string;
  position?: number;
  source?: "external" | "platform" | string;
  externalRefs?: ExternalSystemReference[];
};

export type ProductPricing = {
  currency: CurrencyCode;
  listPrice?: number;
  salePrice?: number;
  commercialPrice?: number;
  taxInclusive?: boolean;
  taxRate?: number;
  priceListId?: PlatformEntityId;
  validFrom?: ISODateTime;
  validUntil?: ISODateTime;
  externalRefs?: ExternalSystemReference[];
  metadata?: PlatformMetadata;
};

export type InventoryAvailability = {
  productId: PlatformEntityId;
  branchId?: PlatformEntityId;
  status:
    | "in_stock"
    | "low_stock"
    | "out_of_stock"
    | "reserved"
    | "backordered"
    | "unknown"
    | string;
  quantityOnHand?: number;
  quantityAvailable?: number;
  quantityReserved?: number;
  nextAvailableAt?: ISODateTime;
  externalRefs?: ExternalSystemReference[];
  metadata?: PlatformMetadata;
};

export type CommerceProduct = {
  id: PlatformEntityId;
  businessAccountId: PlatformEntityId;
  sku?: string;
  barcode?: string;
  name: string;
  slug?: string;
  brand?: string;
  categoryIds?: PlatformEntityId[];
  description?: string;
  images?: ProductImage[];
  pricing?: ProductPricing[];
  purchasable?: boolean;
  rentable?: boolean;
  repairable?: boolean;
  taxable?: boolean;
  tags?: string[];
  attributes?: Record<string, string | number | boolean | null>;
  active: boolean;
  externalRefs?: ExternalSystemReference[];
  metadata?: PlatformMetadata;
};

export type RentalRatePlan = {
  id?: PlatformEntityId;
  rentalAssetId?: PlatformEntityId;
  currency: CurrencyCode;
  dailyRate?: number;
  weeklyRate?: number;
  monthlyRate?: number;
  depositAmount?: number;
  minimumDurationHours?: number;
  maximumDurationHours?: number;
  taxInclusive?: boolean;
  externalRefs?: ExternalSystemReference[];
  metadata?: PlatformMetadata;
};

export type RentalAsset = {
  id: PlatformEntityId;
  businessAccountId: PlatformEntityId;
  productId?: PlatformEntityId;
  branchId?: PlatformEntityId;
  name?: string;
  assetTag?: string;
  serialNumber?: string;
  status:
    | "available"
    | "reserved"
    | "rented"
    | "maintenance"
    | "retired"
    | "unavailable"
    | "unknown"
    | string;
  ratePlans?: RentalRatePlan[];
  attributes?: Record<string, string | number | boolean | null>;
  externalRefs?: ExternalSystemReference[];
  metadata?: PlatformMetadata;
};

export type RentalVerificationDecision =
  | "approved"
  | "conditional"
  | "manual_review"
  | "rejected";

export type RentalMachineVerification = {
  rentalAssetId?: PlatformEntityId;
  productId?: PlatformEntityId;
  branchId?: PlatformEntityId;
  verified: boolean;
  rentable: boolean;
  status?: RentalAsset["status"];
  inspectionStatus?: "valid" | "due" | "required" | "failed" | "unknown" | string;
  maintenanceStatus?: "clear" | "due" | "in_progress" | "blocked" | "unknown" | string;
  holdReasons?: string[];
  requiredAccessories?: string[];
  checkedAt: ISODateTime;
  externalRefs?: ExternalSystemReference[];
  metadata?: PlatformMetadata;
};

export type RentalScheduleVerification = {
  requestedStartDate: ISODateTime;
  requestedEndDate: ISODateTime;
  branchId?: PlatformEntityId;
  quantityRequested?: number;
  available: boolean;
  status:
    | "available"
    | "available_later"
    | "available_other_branch"
    | "available_with_transfer"
    | "waitlist"
    | "unavailable"
    | "unknown"
    | string;
  quantityAvailable?: number;
  nextAvailableAt?: ISODateTime;
  alternateBranchIds?: PlatformEntityId[];
  conflicts?: Array<{
    type: string;
    startsAt?: ISODateTime;
    endsAt?: ISODateTime;
    referenceId?: PlatformEntityId;
    message?: string;
  }>;
  checkedAt: ISODateTime;
  metadata?: PlatformMetadata;
};

export type RentalCustomerEligibility = {
  customerAccountId?: PlatformEntityId;
  verified: boolean;
  eligible: boolean;
  accountStanding?: "good" | "restricted" | "blocked" | "unknown" | string;
  overdueRentalCount?: number;
  outstandingBalance?: number;
  depositRequired?: boolean;
  depositAmount?: number;
  identityVerificationRequired?: boolean;
  certificationRequirements?: string[];
  insuranceRequirements?: string[];
  outstandingRequirements?: string[];
  riskFlags?: string[];
  manualReviewRequired?: boolean;
  checkedAt: ISODateTime;
  externalRefs?: ExternalSystemReference[];
  metadata?: PlatformMetadata;
};

export type RentalVerificationResult = {
  businessAccountId: PlatformEntityId;
  decision: RentalVerificationDecision;
  machine: RentalMachineVerification;
  availability: RentalScheduleVerification;
  customer: RentalCustomerEligibility;
  outstandingRequirements?: string[];
  reasons?: string[];
  verifiedAt: ISODateTime;
  metadata?: PlatformMetadata;
};

export type RentalReservationRequest = {
  businessAccountId: PlatformEntityId;
  customerAccountId?: PlatformEntityId;
  rentalAssetId?: PlatformEntityId;
  productId?: PlatformEntityId;
  branchId?: PlatformEntityId;
  startDate: ISODateTime;
  endDate: ISODateTime;
  quantity?: number;
  deliveryRequested?: boolean;
  deliveryAddress?: Branch["address"];
  customerNotes?: string;
  verification?: RentalVerificationResult;
  metadata?: PlatformMetadata;
};

export type RentalReservationResult = {
  id: PlatformEntityId;
  businessAccountId: PlatformEntityId;
  status:
    | "requested"
    | "verification_required"
    | "conditional"
    | "manual_review"
    | "reserved"
    | "confirmed"
    | "declined"
    | "cancelled"
    | "completed"
    | string;
  rentalAssetId?: PlatformEntityId;
  productId?: PlatformEntityId;
  customerAccountId?: PlatformEntityId;
  verification?: RentalVerificationResult;
  externalRefs?: ExternalSystemReference[];
  metadata?: PlatformMetadata;
};

export type RepairRequest = {
  businessAccountId: PlatformEntityId;
  customerAccountId?: PlatformEntityId;
  productId?: PlatformEntityId;
  branchId?: PlatformEntityId;
  equipmentName?: string;
  serialNumber?: string;
  issueDescription: string;
  imageUrls?: string[];
  preferredDate?: ISODateTime;
  customerNotes?: string;
  metadata?: PlatformMetadata;
};

export type RepairJob = {
  id: PlatformEntityId;
  businessAccountId: PlatformEntityId;
  customerAccountId?: PlatformEntityId;
  productId?: PlatformEntityId;
  branchId?: PlatformEntityId;
  status:
    | "requested"
    | "received"
    | "diagnosing"
    | "quoted"
    | "approved"
    | "in_repair"
    | "ready"
    | "collected"
    | "cancelled"
    | string;
  issueDescription?: string;
  diagnosis?: string;
  estimatedCompletionAt?: ISODateTime;
  externalRefs?: ExternalSystemReference[];
  metadata?: PlatformMetadata;
};

export type CommercialQuoteRequest = {
  businessAccountId: PlatformEntityId;
  customerAccountId?: PlatformEntityId;
  companyName?: string;
  branchId?: PlatformEntityId;
  requestedItems?: Array<{
    productId?: PlatformEntityId;
    sku?: string;
    name?: string;
    quantity?: number;
    notes?: string;
  }>;
  requestDetails: string;
  customerNotes?: string;
  metadata?: PlatformMetadata;
};

export type CommercialQuoteResult = {
  id: PlatformEntityId;
  businessAccountId: PlatformEntityId;
  customerAccountId?: PlatformEntityId;
  status:
    | "requested"
    | "under_review"
    | "quoted"
    | "accepted"
    | "declined"
    | "expired"
    | string;
  currency?: CurrencyCode;
  totalAmount?: number;
  validUntil?: ISODateTime;
  externalRefs?: ExternalSystemReference[];
  metadata?: PlatformMetadata;
};

export type PlatformOrder = {
  id: PlatformEntityId;
  businessAccountId: PlatformEntityId;
  customerAccountId?: PlatformEntityId;
  branchId?: PlatformEntityId;
  status:
    | "draft"
    | "submitted"
    | "accepted"
    | "processing"
    | "fulfilled"
    | "cancelled"
    | "refunded"
    | string;
  currency: CurrencyCode;
  lines: Array<{
    id?: PlatformEntityId;
    productId?: PlatformEntityId;
    rentalAssetId?: PlatformEntityId;
    description: string;
    quantity: number;
    unitPrice?: number;
    taxAmount?: number;
    totalAmount?: number;
    metadata?: PlatformMetadata;
  }>;
  subtotalAmount?: number;
  taxAmount?: number;
  discountAmount?: number;
  totalAmount?: number;
  externalRefs?: ExternalSystemReference[];
  metadata?: PlatformMetadata;
};

export type PlatformInvoice = {
  id: PlatformEntityId;
  businessAccountId: PlatformEntityId;
  customerAccountId?: PlatformEntityId;
  orderId?: PlatformEntityId;
  invoiceNumber?: string;
  status: "draft" | "issued" | "paid" | "void" | "overdue" | string;
  currency: CurrencyCode;
  subtotalAmount?: number;
  taxAmount?: number;
  totalAmount?: number;
  dueAt?: ISODateTime;
  issuedAt?: ISODateTime;
  externalRefs?: ExternalSystemReference[];
  metadata?: PlatformMetadata;
};

export type PlatformSyncResult = {
  providerId: string;
  businessAccountId: PlatformEntityId;
  status: "success" | "partial_success" | "failed" | string;
  startedAt?: ISODateTime;
  completedAt?: ISODateTime;
  recordsRead?: number;
  recordsCreated?: number;
  recordsUpdated?: number;
  recordsDeleted?: number;
  recordsFailed?: number;
  errors?: PlatformApiError[];
  metadata?: PlatformMetadata;
};

export type PlatformWebhookEvent = {
  id?: PlatformEntityId;
  providerId: string;
  businessAccountId?: PlatformEntityId;
  eventType: string;
  occurredAt?: ISODateTime;
  signature?: string;
  headers?: Record<string, string>;
  payload: unknown;
  externalRefs?: ExternalSystemReference[];
  metadata?: PlatformMetadata;
};