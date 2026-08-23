import { neon } from "@neondatabase/serverless";
import { randomBytes } from "node:crypto";

let sqlClient: ReturnType<typeof neon> | undefined;
let schemaReady = false;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("RETURNS_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

export type ReturnResolution = "refund" | "exchange" | "repair" | "store_credit";
export type ReturnReason = "defective" | "damaged" | "wrong_item" | "not_as_described" | "changed_mind" | "other";
export type ReturnStatus =
  | "requested"
  | "under_review"
  | "approved"
  | "rejected"
  | "awaiting_item"
  | "received"
  | "refund_pending"
  | "refund_completed"
  | "exchange_pending"
  | "exchange_completed"
  | "repair_pending"
  | "repair_completed"
  | "store_credit_pending"
  | "store_credit_completed"
  | "closed";

export type ReturnReviewAction =
  | "start_review"
  | "approve"
  | "reject"
  | "request_item_return"
  | "mark_received"
  | "mark_refund_pending"
  | "mark_refund_completed"
  | "mark_exchange_pending"
  | "mark_exchange_completed"
  | "mark_repair_pending"
  | "mark_repair_completed"
  | "mark_store_credit_pending"
  | "mark_store_credit_completed"
  | "close";

const RESOLUTIONS = new Set<ReturnResolution>(["refund", "exchange", "repair", "store_credit"]);
const REASONS = new Set<ReturnReason>(["defective", "damaged", "wrong_item", "not_as_described", "changed_mind", "other"]);

const ACTION_STATUS: Record<ReturnReviewAction, ReturnStatus> = {
  start_review: "under_review",
  approve: "approved",
  reject: "rejected",
  request_item_return: "awaiting_item",
  mark_received: "received",
  mark_refund_pending: "refund_pending",
  mark_refund_completed: "refund_completed",
  mark_exchange_pending: "exchange_pending",
  mark_exchange_completed: "exchange_completed",
  mark_repair_pending: "repair_pending",
  mark_repair_completed: "repair_completed",
  mark_store_credit_pending: "store_credit_pending",
  mark_store_credit_completed: "store_credit_completed",
  close: "closed",
};

const ALLOWED_ACTIONS: Record<ReturnStatus, ReturnReviewAction[]> = {
  requested: ["start_review", "reject"],
  under_review: ["approve", "reject"],
  approved: ["request_item_return", "mark_received", "mark_refund_pending", "mark_exchange_pending", "mark_repair_pending", "mark_store_credit_pending"],
  rejected: ["close"],
  awaiting_item: ["mark_received", "reject"],
  received: ["mark_refund_pending", "mark_exchange_pending", "mark_repair_pending", "mark_store_credit_pending"],
  refund_pending: ["mark_refund_completed"],
  refund_completed: ["close"],
  exchange_pending: ["mark_exchange_completed"],
  exchange_completed: ["close"],
  repair_pending: ["mark_repair_completed"],
  repair_completed: ["close"],
  store_credit_pending: ["mark_store_credit_completed"],
  store_credit_completed: ["close"],
  closed: [],
};

const RESOLUTION_ACTIONS: Record<ReturnResolution, Set<ReturnReviewAction>> = {
  refund: new Set(["mark_refund_pending", "mark_refund_completed"]),
  exchange: new Set(["mark_exchange_pending", "mark_exchange_completed"]),
  repair: new Set(["mark_repair_pending", "mark_repair_completed"]),
  store_credit: new Set(["mark_store_credit_pending", "mark_store_credit_completed"]),
};

const RESOLUTION_SPECIFIC_ACTIONS = new Set<ReturnReviewAction>([
  "mark_refund_pending", "mark_refund_completed",
  "mark_exchange_pending", "mark_exchange_completed",
  "mark_repair_pending", "mark_repair_completed",
  "mark_store_credit_pending", "mark_store_credit_completed",
]);

function clean(value: unknown, max = 500) { return String(value || "").trim().slice(0, max); }

export async function ensureReturnSchema() {
  if (schemaReady) return;
  const db = sql();
  await db`CREATE TABLE IF NOT EXISTS return_requests (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    order_id TEXT NOT NULL,
    commercial_account_id TEXT,
    status TEXT NOT NULL DEFAULT 'requested',
    requested_resolution TEXT NOT NULL,
    reason TEXT NOT NULL,
    item_summary TEXT,
    customer_notes TEXT,
    currency TEXT NOT NULL DEFAULT 'JMD',
    requested_amount_minor BIGINT,
    approved_amount_minor BIGINT,
    provider_return_id TEXT,
    refund_reference TEXT,
    staff_notes TEXT,
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await db`CREATE TABLE IF NOT EXISTS return_request_events (
    id TEXT PRIMARY KEY,
    return_id TEXT NOT NULL REFERENCES return_requests(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    actor_type TEXT NOT NULL,
    actor_id TEXT,
    public_message TEXT,
    internal_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await db`CREATE INDEX IF NOT EXISTS return_requests_customer_idx ON return_requests(customer_id, created_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS return_requests_status_idx ON return_requests(status, updated_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS return_requests_order_idx ON return_requests(order_id, created_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS return_events_return_idx ON return_request_events(return_id, created_at ASC)`;
  schemaReady = true;
}

async function ownedOrder(orderId: string, customerId: string) {
  await ensureReturnSchema();
  const rows = await sql()`SELECT order_id, customer_id, commercial_account_id, currency, debit_minor, status
    FROM commercial_account_ledger_entries
    WHERE order_id=${orderId} AND customer_id=${customerId} AND entry_type='order_charge'
    ORDER BY occurred_at DESC LIMIT 1` as unknown as Array<any>;
  return rows[0] || null;
}

async function addEvent(input: { returnId: string; status: string; actorType: string; actorId?: string; publicMessage?: string; internalNote?: string }) {
  const id = `rte_${randomBytes(16).toString("hex")}`;
  await sql()`INSERT INTO return_request_events (id, return_id, status, actor_type, actor_id, public_message, internal_note)
    VALUES (${id},${input.returnId},${input.status},${input.actorType},${input.actorId || null},${input.publicMessage || null},${input.internalNote || null})`;
}

export async function createReturnRequest(input: {
  customerId: string;
  orderId: string;
  requestedResolution: string;
  reason: string;
  itemSummary?: string;
  customerNotes?: string;
  requestedAmountMinor?: number;
}) {
  const orderId = clean(input.orderId, 180);
  const resolution = clean(input.requestedResolution, 32) as ReturnResolution;
  const reason = clean(input.reason, 32) as ReturnReason;
  if (!orderId) throw new Error("RETURN_ORDER_REQUIRED");
  if (!RESOLUTIONS.has(resolution)) throw new Error("RETURN_RESOLUTION_INVALID");
  if (!REASONS.has(reason)) throw new Error("RETURN_REASON_INVALID");
  const order = await ownedOrder(orderId, input.customerId);
  if (!order) throw new Error("RETURN_ORDER_NOT_OWNED");

  const existing = await sql()`SELECT * FROM return_requests WHERE order_id=${orderId} AND customer_id=${input.customerId}
    AND status NOT IN ('rejected','closed','refund_completed','exchange_completed','repair_completed','store_credit_completed') ORDER BY created_at DESC LIMIT 1` as unknown as Array<any>;
  if (existing[0]) return existing[0];

  const requestedAmount = Number(input.requestedAmountMinor);
  const maxMinor = Number(order.debit_minor || 0);
  const amountMinor = Number.isFinite(requestedAmount) && requestedAmount > 0 ? Math.min(Math.trunc(requestedAmount), maxMinor) : null;
  const id = `ret_${randomBytes(16).toString("hex")}`;
  const rows = await sql()`INSERT INTO return_requests (
      id, customer_id, order_id, commercial_account_id, requested_resolution, reason,
      item_summary, customer_notes, currency, requested_amount_minor
    ) VALUES (
      ${id},${input.customerId},${orderId},${order.commercial_account_id || null},${resolution},${reason},
      ${clean(input.itemSummary,1000) || null},${clean(input.customerNotes,2000) || null},${String(order.currency || "JMD")},${amountMinor}
    ) RETURNING *` as unknown as Array<any>;
  await addEvent({ returnId: id, status: "requested", actorType: "customer", actorId: input.customerId, publicMessage: "Return request received. Our team will review the order and requested resolution." });
  return rows[0];
}

export async function listCustomerReturns(customerId: string) {
  await ensureReturnSchema();
  return sql()`SELECT * FROM return_requests WHERE customer_id=${customerId} ORDER BY created_at DESC LIMIT 100` as unknown as Promise<Array<any>>;
}

export async function getCustomerReturn(returnId: string, customerId: string) {
  await ensureReturnSchema();
  const rows = await sql()`SELECT * FROM return_requests WHERE id=${returnId} AND customer_id=${customerId} LIMIT 1` as unknown as Array<any>;
  if (!rows[0]) return null;
  const events = await sql()`SELECT status, public_message, created_at FROM return_request_events WHERE return_id=${returnId} ORDER BY created_at ASC` as unknown as Array<any>;
  return { request: rows[0], events };
}

export async function listStaffReturns(status?: string) {
  await ensureReturnSchema();
  const normalized = clean(status, 40);
  return normalized && normalized !== "all"
    ? sql()`SELECT * FROM return_requests WHERE status=${normalized} ORDER BY updated_at ASC LIMIT 200` as unknown as Promise<Array<any>>
    : sql()`SELECT * FROM return_requests ORDER BY updated_at DESC LIMIT 200` as unknown as Promise<Array<any>>;
}

export async function reviewReturnRequest(input: {
  id: string;
  staffId: string;
  action: ReturnReviewAction;
  approvedAmountMinor?: number;
  providerReturnId?: string;
  refundReference?: string;
  staffNotes?: string;
  publicMessage?: string;
}) {
  await ensureReturnSchema();
  const id = clean(input.id, 180);
  const rows = await sql()`SELECT * FROM return_requests WHERE id=${id} LIMIT 1` as unknown as Array<any>;
  const current = rows[0];
  if (!current) throw new Error("RETURN_NOT_FOUND");

  const action = clean(input.action, 40) as ReturnReviewAction;
  const next = ACTION_STATUS[action];
  if (!next) throw new Error("RETURN_ACTION_INVALID");
  const currentStatus = clean(current.status, 40) as ReturnStatus;
  if (!ALLOWED_ACTIONS[currentStatus]?.includes(action)) throw new Error("RETURN_TRANSITION_INVALID");

  const resolution = clean(current.requested_resolution, 32) as ReturnResolution;
  if (RESOLUTION_SPECIFIC_ACTIONS.has(action) && !RESOLUTION_ACTIONS[resolution]?.has(action)) {
    throw new Error("RETURN_RESOLUTION_MISMATCH");
  }

  const providerReturnId = clean(input.providerReturnId, 180);
  const refundReference = clean(input.refundReference, 180);
  if (next === "refund_completed" && !refundReference) throw new Error("REFUND_REFERENCE_REQUIRED");
  if ((next === "exchange_completed" || next === "repair_completed" || next === "store_credit_completed") && !providerReturnId) {
    throw new Error("RESOLUTION_REFERENCE_REQUIRED");
  }

  const order = await ownedOrder(String(current.order_id), String(current.customer_id));
  if (!order) throw new Error("RETURN_ORDER_NOT_OWNED");
  const maxMinor = Number(order.debit_minor || 0);
  const approved = Number(input.approvedAmountMinor);
  const approvedMinor = Number.isFinite(approved) && approved >= 0 ? Math.trunc(approved) : null;
  if (approvedMinor !== null && approvedMinor > maxMinor) throw new Error("RETURN_AMOUNT_EXCEEDS_ORDER");
  if ((action === "approve" || action === "mark_refund_pending" || action === "mark_store_credit_pending") && approvedMinor === null && current.approved_amount_minor == null) {
    throw new Error("RETURN_APPROVED_AMOUNT_REQUIRED");
  }

  const updated = await sql()`UPDATE return_requests SET
      status=${next},
      approved_amount_minor=COALESCE(${approvedMinor},approved_amount_minor),
      provider_return_id=COALESCE(${providerReturnId || null},provider_return_id),
      refund_reference=COALESCE(${refundReference || null},refund_reference),
      staff_notes=COALESCE(${clean(input.staffNotes,3000) || null},staff_notes),
      reviewed_by=${input.staffId}, reviewed_at=NOW(), updated_at=NOW()
    WHERE id=${id} AND status=${currentStatus}
    RETURNING *` as unknown as Array<any>;
  if (!updated[0]) throw new Error("RETURN_STATE_CHANGED");
  await addEvent({ returnId: id, status: next, actorType: "staff", actorId: input.staffId, publicMessage: clean(input.publicMessage,1000) || undefined, internalNote: clean(input.staffNotes,3000) || undefined });
  return updated[0];
}
