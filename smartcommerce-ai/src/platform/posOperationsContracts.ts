import type {
  CurrencyCode,
  ExternalSystemReference,
  ISODateTime,
  PlatformEntityId,
  PlatformMetadata,
} from "./contracts";

export type PosEmployee = {
  id: PlatformEntityId;
  businessAccountId: PlatformEntityId;
  branchId?: PlatformEntityId;
  employeeNumber?: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  role?: string;
  active: boolean;
  hourlyRate?: number;
  currency?: CurrencyCode;
  externalRefs?: ExternalSystemReference[];
  metadata?: PlatformMetadata;
};

export type TechnicianSkill = {
  id: PlatformEntityId;
  businessAccountId: PlatformEntityId;
  name: string;
  active: boolean;
  metadata?: PlatformMetadata;
};

export type TechnicianSkillAssignment = {
  employeeId: PlatformEntityId;
  skillId: PlatformEntityId;
  proficiency?: "learning" | "qualified" | "advanced" | "expert" | string;
  certifiedAt?: ISODateTime;
  expiresAt?: ISODateTime;
  metadata?: PlatformMetadata;
};

export type WorkOrderStatus =
  | "requested"
  | "intake"
  | "assessment"
  | "awaiting_approval"
  | "pending_deposit"
  | "approved"
  | "in_progress"
  | "awaiting_parts"
  | "awaiting_signoff"
  | "quality_control"
  | "awaiting_pickup"
  | "picked_up"
  | "cancelled"
  | string;

export type WorkOrderPartSource = {
  id?: PlatformEntityId;
  branchId?: PlatformEntityId;
  quantity: number;
  transferId?: PlatformEntityId;
  purchaseRequestId?: PlatformEntityId;
  status?: string;
  metadata?: PlatformMetadata;
};

export type WorkOrderPart = {
  id: PlatformEntityId;
  workOrderId: PlatformEntityId;
  productId?: PlatformEntityId;
  sku?: string;
  productName: string;
  quantity: number;
  unitCost?: number;
  unitPrice?: number;
  total?: number;
  currency?: CurrencyCode;
  customerSupplied?: boolean;
  temporaryItem?: boolean;
  sources?: WorkOrderPartSource[];
  metadata?: PlatformMetadata;
};

export type TechnicianTimeEntry = {
  id: PlatformEntityId;
  workOrderId: PlatformEntityId;
  taskId: PlatformEntityId;
  technicianId: PlatformEntityId;
  startedAt: ISODateTime;
  endedAt?: ISODateTime;
  minutes?: number;
  entryType?: "productive" | "diagnostic" | "rework" | "warranty" | "training" | "other" | string;
  billable?: boolean;
  approvedBy?: PlatformEntityId;
  metadata?: PlatformMetadata;
};

export type WorkOrderTask = {
  id: PlatformEntityId;
  workOrderId: PlatformEntityId;
  description: string;
  technicianId?: PlatformEntityId;
  status: "pending" | "scheduled" | "in_progress" | "paused" | "complete" | "cancelled" | string;
  allottedMinutes?: number;
  billedMinutes?: number;
  actualMinutes?: number;
  requiredSkillIds?: PlatformEntityId[];
  timeEntries?: TechnicianTimeEntry[];
  metadata?: PlatformMetadata;
};

export type WorkOrderStatusEvent = {
  id: PlatformEntityId;
  workOrderId: PlatformEntityId;
  status: WorkOrderStatus;
  comment?: string;
  employeeId?: PlatformEntityId;
  occurredAt: ISODateTime;
  metadata?: PlatformMetadata;
};

export type PosWorkOrder = {
  id: PlatformEntityId;
  businessAccountId: PlatformEntityId;
  workOrderNumber: string;
  customerAccountId?: PlatformEntityId;
  branchId?: PlatformEntityId;
  assignedEmployeeId?: PlatformEntityId;
  equipmentName?: string;
  manufacturer?: string;
  modelNumber?: string;
  serialNumber?: string;
  customerComplaint?: string;
  intakeCondition?: string;
  diagnosis?: string;
  status: WorkOrderStatus;
  priority?: "low" | "normal" | "high" | "urgent" | string;
  assessmentFee?: number;
  depositAmount?: number;
  estimatedLaborAmount?: number;
  estimatedPartsAmount?: number;
  finalLaborAmount?: number;
  finalPartsAmount?: number;
  totalAmount?: number;
  currency?: CurrencyCode;
  promisedAt?: ISODateTime;
  pickupDueAt?: ISODateTime;
  completedAt?: ISODateTime;
  collectedAt?: ISODateTime;
  warranty?: boolean;
  rework?: boolean;
  imageUrls?: string[];
  tasks?: WorkOrderTask[];
  parts?: WorkOrderPart[];
  statusHistory?: WorkOrderStatusEvent[];
  externalRefs?: ExternalSystemReference[];
  metadata?: PlatformMetadata;
};

export type TechnicianScheduleEntry = {
  id: PlatformEntityId;
  businessAccountId: PlatformEntityId;
  employeeId: PlatformEntityId;
  workOrderTaskId?: PlatformEntityId;
  scheduledDate: string;
  startsAt?: ISODateTime;
  endsAt?: ISODateTime;
  notes?: string;
  metadata?: PlatformMetadata;
};

export type TechnicianPerformance = {
  employeeId: PlatformEntityId;
  periodStart: ISODateTime;
  periodEnd: ISODateTime;
  clockedMinutes?: number;
  productiveMinutes?: number;
  billableMinutes?: number;
  completedTaskCount?: number;
  completedWorkOrderCount?: number;
  firstTimeFixRate?: number;
  reworkRate?: number;
  utilizationRate?: number;
  efficiencyRate?: number;
  qualityScore?: number;
  quotaAttainment?: number;
  incentiveAmount?: number;
  estimatedCompensation?: number;
  currency?: CurrencyCode;
  metadata?: PlatformMetadata;
};

export type PosSupplier = {
  id: PlatformEntityId;
  businessAccountId: PlatformEntityId;
  name: string;
  code?: string;
  email?: string;
  phone?: string;
  active: boolean;
  externalRefs?: ExternalSystemReference[];
  metadata?: PlatformMetadata;
};

export type PurchaseRequestLine = {
  id?: PlatformEntityId;
  productId?: PlatformEntityId;
  sku?: string;
  description: string;
  quantity: number;
  workOrderId?: PlatformEntityId;
  metadata?: PlatformMetadata;
};

export type PurchaseRequest = {
  id: PlatformEntityId;
  businessAccountId: PlatformEntityId;
  requestNumber: string;
  branchId?: PlatformEntityId;
  supplierId?: PlatformEntityId;
  status: string;
  requestedBy?: PlatformEntityId;
  approvedBy?: PlatformEntityId;
  lines: PurchaseRequestLine[];
  createdAt?: ISODateTime;
  externalRefs?: ExternalSystemReference[];
  metadata?: PlatformMetadata;
};

export type PurchaseOrder = {
  id: PlatformEntityId;
  businessAccountId: PlatformEntityId;
  purchaseOrderNumber: string;
  branchId?: PlatformEntityId;
  supplierId?: PlatformEntityId;
  status: string;
  currency?: CurrencyCode;
  totalAmount?: number;
  expectedAt?: ISODateTime;
  receivedAt?: ISODateTime;
  externalRefs?: ExternalSystemReference[];
  metadata?: PlatformMetadata;
};

export type BranchTransfer = {
  id: PlatformEntityId;
  businessAccountId: PlatformEntityId;
  transferNumber: string;
  fromBranchId: PlatformEntityId;
  toBranchId: PlatformEntityId;
  status: string;
  requestedAt?: ISODateTime;
  shippedAt?: ISODateTime;
  receivedAt?: ISODateTime;
  externalRefs?: ExternalSystemReference[];
  metadata?: PlatformMetadata;
};

export type PosQuotation = {
  id: PlatformEntityId;
  businessAccountId: PlatformEntityId;
  quotationNumber: string;
  customerAccountId?: PlatformEntityId;
  branchId?: PlatformEntityId;
  workOrderId?: PlatformEntityId;
  status: string;
  currency?: CurrencyCode;
  subtotalAmount?: number;
  taxAmount?: number;
  totalAmount?: number;
  validUntil?: ISODateTime;
  externalRefs?: ExternalSystemReference[];
  metadata?: PlatformMetadata;
};

export type PosTransaction = {
  id: PlatformEntityId;
  businessAccountId: PlatformEntityId;
  transactionNumber?: string;
  customerAccountId?: PlatformEntityId;
  branchId?: PlatformEntityId;
  employeeId?: PlatformEntityId;
  workOrderId?: PlatformEntityId;
  orderId?: PlatformEntityId;
  type: "sale" | "refund" | "deposit" | "repair_payment" | "rental_payment" | "adjustment" | string;
  status: string;
  currency: CurrencyCode;
  subtotalAmount?: number;
  taxAmount?: number;
  discountAmount?: number;
  totalAmount?: number;
  occurredAt?: ISODateTime;
  externalRefs?: ExternalSystemReference[];
  metadata?: PlatformMetadata;
};

export type CashDrawerSession = {
  id: PlatformEntityId;
  businessAccountId: PlatformEntityId;
  branchId?: PlatformEntityId;
  employeeId?: PlatformEntityId;
  status: "open" | "closed" | "balanced" | "variance" | string;
  openedAt?: ISODateTime;
  closedAt?: ISODateTime;
  openingAmount?: number;
  expectedAmount?: number;
  countedAmount?: number;
  varianceAmount?: number;
  currency?: CurrencyCode;
  metadata?: PlatformMetadata;
};

export type PosAuditEvent = {
  id: PlatformEntityId;
  businessAccountId: PlatformEntityId;
  actorId?: PlatformEntityId;
  branchId?: PlatformEntityId;
  entityType: string;
  entityId?: PlatformEntityId;
  action: string;
  occurredAt: ISODateTime;
  before?: unknown;
  after?: unknown;
  reason?: string;
  requestId?: string;
  metadata?: PlatformMetadata;
};

export type SmartCommercePosExportManifest = {
  schemaVersion: "1.0";
  businessAccountId: PlatformEntityId;
  providerId: string;
  generatedAt: ISODateTime;
  resources: Array<{
    name:
      | "branches"
      | "categories"
      | "products"
      | "inventory"
      | "customers"
      | "orders"
      | "invoices"
      | "rentals"
      | "work_orders"
      | "technicians"
      | "technician_skills"
      | "technician_schedule"
      | "technician_performance"
      | "suppliers"
      | "purchase_requests"
      | "purchase_orders"
      | "branch_transfers"
      | "quotations"
      | "transactions"
      | "cash_drawers"
      | "audit_events";
    endpoint: string;
    modes: Array<"snapshot" | "incremental" | "realtime">;
    cursorSupported?: boolean;
    webhookEvents?: string[];
  }>;
  metadata?: PlatformMetadata;
};
