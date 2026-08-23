export type HandoffItem = {
  productId?: string | number;
  sku?: string;
  name?: string;
  description?: string;
  quantity: number;
  unitPrice?: number;
};

export type TypedHandoff = {
  kind: "quote" | "repair" | "rental" | "purchase_request" | "purchase_order" | "transfer" | "inventory" | "customer" | "sale" | "unknown";
  customerId?: string | number;
  branchId?: string | number;
  externalReference?: string;
  notes?: string;
  items: HandoffItem[];
  fields: Record<string, unknown>;
  missing: string[];
  warnings: string[];
};

type Row = Record<string, any>;
const text = (...values: unknown[]) => values.find((v) => typeof v === "string" && v.trim()) as string | undefined;
const numeric = (...values: unknown[]) => {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return undefined;
};
const positiveInt = (...values: unknown[]) => Math.max(1, Math.trunc(numeric(...values) || 1));

function array(value: unknown) { return Array.isArray(value) ? value as Row[] : []; }
function itemRows(payload: Row) {
  const listed = array(payload.items).length ? array(payload.items)
    : array(payload.lines).length ? array(payload.lines)
    : array(payload.products).length ? array(payload.products)
    : array(payload.cart).length ? array(payload.cart)
    : [];
  if (listed.length) return listed;
  const hasSingleProduct = payload.product_id !== undefined || payload.productId !== undefined || payload.sku || payload.product_sku || payload.productSku || payload.product_name || payload.productName;
  return hasSingleProduct ? [payload] : [];
}

function items(payload: Row): HandoffItem[] {
  return itemRows(payload).map((row) => ({
    productId: row.product_id ?? row.productId ?? row.id,
    sku: text(row.sku, row.product_sku, row.productSku),
    name: text(row.product_name, row.productName, row.name),
    description: text(row.description, row.details),
    quantity: positiveInt(row.quantity, row.qty, row.transfer_quantity, row.transferQuantity),
    unitPrice: numeric(row.unit_price, row.unitPrice, row.price, row.quoted_price),
  })).filter((row) => row.productId !== undefined || row.sku || row.name || row.description);
}

function kindFor(value: string): TypedHandoff["kind"] {
  const type = value.toLowerCase();
  if (/commercial_quote|quotation|quote_request|quote/.test(type)) return "quote";
  if (/repair_request|repair|work_order|service_job/.test(type)) return "repair";
  if (/rental_reservation|rental_extension|rental_request|rental/.test(type)) return "rental";
  if (/purchase_order/.test(type)) return "purchase_order";
  if (/purchase_request|requisition|procurement_request/.test(type)) return "purchase_request";
  if (/transfer|stock_transfer|branch_transfer/.test(type)) return "transfer";
  if (/inventory|stock_adjustment|stock_recommendation|inventory_recommendation/.test(type)) return "inventory";
  if (/customer|account_update|customer_profile|profile_update/.test(type)) return "customer";
  if (/order|checkout|sale|transaction/.test(type)) return "sale";
  return "unknown";
}

export function normalizeOmnichannelHandoff(row: Row): TypedHandoff {
  const payload = (row?.payload && typeof row.payload === "object" ? row.payload : {}) as Row;
  const kind = kindFor(String(row?.item_type || payload.type || payload.kind || ""));
  const normalizedItems = items(payload);
  const customerId = payload.customer_id ?? payload.customerId ?? row.customer_id;
  const branchId = payload.branch_id ?? payload.branchId ?? row.branch_id;
  const sourceBranchId = payload.source_branch_id ?? payload.sourceBranchId ?? payload.from_branch_id ?? payload.fromBranchId;
  const destinationBranchId = payload.destination_branch_id ?? payload.destinationBranchId ?? payload.to_branch_id ?? payload.toBranchId;
  const adjustment = numeric(payload.adjustment, payload.quantity_change, payload.quantityChange, payload.stock_adjustment, payload.stockAdjustment);
  const reason = text(payload.reason, payload.adjustment_reason, payload.adjustmentReason, payload.review_reason);
  const startDate = text(payload.start_date, payload.startDate, payload.start_at, payload.startAt, payload.rental_start, payload.rentalStart);
  const dueDate = text(payload.due_date, payload.dueDate, payload.end_at, payload.endAt, payload.rental_end, payload.rentalEnd, payload.return_at, payload.returnAt);
  const firstName = text(payload.first_name, payload.firstName);
  const lastName = text(payload.last_name, payload.lastName);
  const fullName = text(payload.full_name, payload.fullName, payload.customer_name, payload.customerName, payload.name);
  const company = text(payload.company, payload.company_name, payload.companyName, payload.business_name, payload.businessName);
  const phone = text(payload.phone, payload.phone_number, payload.phoneNumber, payload.mobile);
  const email = text(payload.email, payload.email_address, payload.emailAddress);
  const address = text(payload.address, payload.address_line_1, payload.addressLine1, payload.street_address, payload.streetAddress);
  const externalReference = text(row.external_id, payload.external_reference, payload.externalReference, payload.reference);
  const notes = text(payload.notes, payload.note, payload.details, payload.description, row.processing_note);
  const missing: string[] = [];
  const warnings: string[] = [];

  if (["quote", "purchase_request", "purchase_order", "transfer", "inventory", "rental", "sale"].includes(kind) && !normalizedItems.length) missing.push(kind === "inventory" ? "product" : "items");
  if (["quote", "repair", "rental", "customer", "sale"].includes(kind) && !customerId) warnings.push("Customer is not linked to an authoritative POS customer record.");
  if (["quote", "repair", "rental", "purchase_request", "purchase_order", "inventory", "sale"].includes(kind) && !branchId) warnings.push("Branch was not supplied; the staff member's assigned branch must be confirmed.");
  if (kind === "transfer") {
    if (!sourceBranchId) missing.push("source branch");
    if (!destinationBranchId) missing.push("destination branch");
    if (sourceBranchId && destinationBranchId && String(sourceBranchId) === String(destinationBranchId)) missing.push("different destination branch");
  }
  if (kind === "inventory") {
    if (adjustment === undefined || !Number.isInteger(adjustment) || adjustment === 0) missing.push("non-zero whole-number adjustment");
    if (!reason) missing.push("adjustment reason");
  }
  if (kind === "rental") {
    if (!customerId) missing.push("authoritative customer");
    if (!startDate) missing.push("rental start");
    if (!dueDate) missing.push("rental end/return");
    if (startDate && dueDate) {
      const start = new Date(startDate).getTime();
      const end = new Date(dueDate).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) missing.push("valid rental date range");
    }
  }
  if (kind === "customer") {
    if (!customerId) missing.push("authoritative customer");
    if (![firstName, lastName, fullName, company, phone, email, address].some(Boolean)) missing.push("profile/contact change");
    warnings.push("Only ordinary customer profile/contact fields may be applied here; financial, verification, permission, tax and security fields are excluded.");
  }
  for (const item of normalizedItems) {
    if (item.productId === undefined && !item.sku) warnings.push(`Item ${item.name || item.description || "line"} is not linked to an authoritative product ID/SKU.`);
    if (["transfer", "inventory", "rental"].includes(kind) && item.productId === undefined) warnings.push(`Item ${item.name || item.sku || "line"} must be linked to an authoritative POS product ID before this operation can continue.`);
    if (item.unitPrice !== undefined && item.unitPrice < 0) warnings.push("A negative supplied item price was ignored by destination validation.");
  }

  return {
    kind, customerId, branchId, externalReference, notes, items: normalizedItems,
    fields: {
      dueDate,
      startDate,
      validUntil: text(payload.valid_until, payload.validUntil),
      equipment: text(payload.equipment, payload.equipment_name, payload.product_name),
      issue: text(payload.issue, payload.problem, payload.fault, payload.description),
      priority: text(payload.priority, row.priority),
      supplierId: payload.supplier_id ?? payload.supplierId,
      sourceBranchId,
      destinationBranchId,
      adjustment,
      reason,
      fulfillment: text(payload.fulfillment, payload.fulfillment_method, payload.fulfillmentMethod, payload.delivery_method, payload.deliveryMethod),
      firstName,
      lastName,
      fullName,
      company,
      phone,
      email,
      address,
    },
    missing: Array.from(new Set(missing)),
    warnings: Array.from(new Set(warnings)),
  };
}
