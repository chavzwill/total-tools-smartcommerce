import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";

let sqlClient: ReturnType<typeof neon> | undefined;
let schemaReady = false;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("OMNICHANNEL_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export type ChannelName = "website" | "ios" | "android" | "smartcommerce" | "partner" | "api" | string;
export type IntakeStatus = "received" | "auto_accepted" | "review_required" | "approved" | "rejected" | "processing" | "applied" | "failed";
export type WorkflowSection = "quotes" | "repairs" | "rentals" | "purchasing" | "inventory" | "pos" | "reports" | "reviews";
export type WorkflowDestination = {
  section: WorkflowSection;
  resource: string;
  label: string;
  mode: "staff_workflow" | "read_only_handoff";
  instructions: string;
};

export function workflowDestinationForType(itemType: string): WorkflowDestination {
  const type = String(itemType || "").trim().toLowerCase();
  if (/commercial_quote|quotation|quote_request|quote/.test(type)) return { section: "quotes", resource: "quotations", label: "Quotations", mode: "staff_workflow", instructions: "Open Quotations, verify live pricing/stock and continue through the normal quotation approval or conversion workflow." };
  if (/repair_request|repair|work_order|service_job/.test(type)) return { section: "repairs", resource: "work-orders", label: "Repair work orders", mode: "staff_workflow", instructions: "Open Repairs and complete intake/assessment using the normal work-order controls." };
  if (/rental_reservation|rental_extension|rental/.test(type)) return { section: "rentals", resource: "rentals", label: "Rental operations", mode: "staff_workflow", instructions: "Open Rentals and complete machine, schedule and customer eligibility verification before issue/checkout." };
  if (/purchase_order/.test(type)) return { section: "purchasing", resource: "purchase-orders", label: "Purchase orders", mode: "staff_workflow", instructions: "Open Purchasing and continue through PO review, approval and receiving." };
  if (/purchase_request|requisition|procurement_request/.test(type)) return { section: "purchasing", resource: "purchase-requests", label: "Purchase requests", mode: "staff_workflow", instructions: "Open Purchasing and continue through PR approval/conversion." };
  if (/transfer|stock_transfer|branch_transfer/.test(type)) return { section: "purchasing", resource: "transfers", label: "Branch transfers", mode: "staff_workflow", instructions: "Open Purchasing > Branch Transfers and create/continue the controlled transfer lifecycle." };
  if (/inventory|stock_adjustment|stock_recommendation|inventory_recommendation/.test(type)) return { section: "inventory", resource: "inventory", label: "Inventory control", mode: "staff_workflow", instructions: "Open Inventory and apply any approved adjustment or recommendation through the controlled stock workflow." };
  if (/customer|account_update|customer_profile/.test(type)) return { section: "pos", resource: "customers", label: "Customer records", mode: "staff_workflow", instructions: "Open Point of Sale/customer workflow and verify the customer record before applying changes." };
  if (/order|checkout|sale|transaction/.test(type)) return { section: "pos", resource: "transactions", label: "Point of sale", mode: "staff_workflow", instructions: "Open Point of Sale and complete the transaction through the live stock, tender and drawer controls." };
  if (/invoice|payment|credit|accounting/.test(type)) return { section: "reports", resource: "accounts", label: "Accounts & reporting", mode: "read_only_handoff", instructions: "Review the accounting evidence and use the authoritative account/payment workflow; no financial mutation is performed by intake routing." };
  return { section: "reviews", resource: "", label: "Manual routing required", mode: "read_only_handoff", instructions: "No authoritative downstream workflow is registered for this record type yet. Keep it in Reviews until a supported adapter is configured." };
}

export async function ensureOmnichannelSchema() {
  if (schemaReady) return;
  const db = sql();
  await db`
    CREATE TABLE IF NOT EXISTS omnichannel_events (
      id TEXT PRIMARY KEY,
      source_channel TEXT NOT NULL,
      source_application TEXT NOT NULL,
      event_type TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      customer_id TEXT,
      branch_id TEXT,
      session_id TEXT,
      occurred_at TIMESTAMPTZ NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS omnichannel_intake_items (
      id TEXT PRIMARY KEY,
      idempotency_key_hash TEXT NOT NULL UNIQUE,
      source_channel TEXT NOT NULL,
      source_application TEXT NOT NULL,
      external_id TEXT,
      item_type TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      customer_id TEXT,
      branch_id TEXT,
      status TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'normal',
      review_reason TEXT,
      payload JSONB NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      reviewer_employee_id TEXT,
      reviewer_note TEXT,
      reviewed_at TIMESTAMPTZ,
      destination_section TEXT,
      destination_resource TEXT,
      destination_label TEXT,
      processing_mode TEXT,
      processing_note TEXT,
      dispatched_by_employee_id TEXT,
      dispatched_at TIMESTAMPTZ,
      downstream_reference TEXT,
      processing_error TEXT,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await db`ALTER TABLE omnichannel_intake_items ADD COLUMN IF NOT EXISTS destination_section TEXT`;
  await db`ALTER TABLE omnichannel_intake_items ADD COLUMN IF NOT EXISTS destination_resource TEXT`;
  await db`ALTER TABLE omnichannel_intake_items ADD COLUMN IF NOT EXISTS destination_label TEXT`;
  await db`ALTER TABLE omnichannel_intake_items ADD COLUMN IF NOT EXISTS processing_mode TEXT`;
  await db`ALTER TABLE omnichannel_intake_items ADD COLUMN IF NOT EXISTS processing_note TEXT`;
  await db`ALTER TABLE omnichannel_intake_items ADD COLUMN IF NOT EXISTS dispatched_by_employee_id TEXT`;
  await db`ALTER TABLE omnichannel_intake_items ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ`;
  await db`ALTER TABLE omnichannel_intake_items ADD COLUMN IF NOT EXISTS downstream_reference TEXT`;
  await db`ALTER TABLE omnichannel_intake_items ADD COLUMN IF NOT EXISTS processing_error TEXT`;
  await db`CREATE INDEX IF NOT EXISTS omnichannel_events_occurred_idx ON omnichannel_events(occurred_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS omnichannel_events_source_date_idx ON omnichannel_events(source_channel, occurred_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS omnichannel_events_type_date_idx ON omnichannel_events(event_type, occurred_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS omnichannel_events_customer_date_idx ON omnichannel_events(customer_id, occurred_at DESC) WHERE customer_id IS NOT NULL`;
  await db`CREATE INDEX IF NOT EXISTS omnichannel_events_branch_date_idx ON omnichannel_events(branch_id, occurred_at DESC) WHERE branch_id IS NOT NULL`;
  await db`CREATE INDEX IF NOT EXISTS omnichannel_intake_received_idx ON omnichannel_intake_items(received_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS omnichannel_intake_status_date_idx ON omnichannel_intake_items(status, received_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS omnichannel_intake_source_date_idx ON omnichannel_intake_items(source_channel, received_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS omnichannel_intake_destination_idx ON omnichannel_intake_items(destination_section, status, received_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS omnichannel_intake_customer_date_idx ON omnichannel_intake_items(customer_id, received_at DESC) WHERE customer_id IS NOT NULL`;
  await db`CREATE INDEX IF NOT EXISTS omnichannel_intake_branch_date_idx ON omnichannel_intake_items(branch_id, received_at DESC) WHERE branch_id IS NOT NULL`;
  await db`CREATE INDEX IF NOT EXISTS omnichannel_intake_downstream_ref_idx ON omnichannel_intake_items(destination_resource, downstream_reference) WHERE downstream_reference IS NOT NULL`;
  schemaReady = true;
}

export async function recordChannelEvent(input: {
  sourceChannel: ChannelName;
  sourceApplication?: string;
  eventType: string;
  entityType?: string | null;
  entityId?: string | null;
  customerId?: string | null;
  branchId?: string | null;
  sessionId?: string | null;
  occurredAt?: string;
  payload?: unknown;
  metadata?: Record<string, unknown>;
}) {
  await ensureOmnichannelSchema();
  const id = `oce_${randomBytes(16).toString("hex")}`;
  const occurredAt = input.occurredAt && Number.isFinite(new Date(input.occurredAt).getTime()) ? input.occurredAt : new Date().toISOString();
  const rows = await sql()`
    INSERT INTO omnichannel_events (
      id, source_channel, source_application, event_type, entity_type, entity_id,
      customer_id, branch_id, session_id, occurred_at, payload, metadata
    ) VALUES (
      ${id}, ${String(input.sourceChannel || "api")}, ${String(input.sourceApplication || "smartcommerce")},
      ${input.eventType}, ${input.entityType || null}, ${input.entityId || null}, ${input.customerId || null},
      ${input.branchId || null}, ${input.sessionId || null}, ${occurredAt},
      ${JSON.stringify(input.payload || {})}::jsonb, ${JSON.stringify(input.metadata || {})}::jsonb
    ) RETURNING *
  ` as Array<Record<string, unknown>>;
  return rows[0];
}

export async function ingestExport(input: {
  idempotencyKey: string;
  sourceChannel: ChannelName;
  sourceApplication?: string;
  externalId?: string | null;
  itemType: string;
  entityType?: string | null;
  entityId?: string | null;
  customerId?: string | null;
  branchId?: string | null;
  requiresReview?: boolean;
  priority?: string;
  reviewReason?: string | null;
  payload: unknown;
  metadata?: Record<string, unknown>;
}) {
  await ensureOmnichannelSchema();
  if (!input.idempotencyKey || input.idempotencyKey.length < 8 || input.idempotencyKey.length > 240) throw new Error("OMNICHANNEL_IDEMPOTENCY_KEY_INVALID");
  if (!input.itemType?.trim()) throw new Error("OMNICHANNEL_ITEM_TYPE_REQUIRED");
  const id = `oci_${randomBytes(16).toString("hex")}`;
  const keyHash = hash(input.idempotencyKey);
  const status: IntakeStatus = input.requiresReview ? "review_required" : "auto_accepted";
  const destination = workflowDestinationForType(input.itemType);
  const rows = await sql()`
    INSERT INTO omnichannel_intake_items (
      id, idempotency_key_hash, source_channel, source_application, external_id, item_type,
      entity_type, entity_id, customer_id, branch_id, status, priority, review_reason, payload, metadata,
      destination_section, destination_resource, destination_label, processing_mode, processing_note
    ) VALUES (
      ${id}, ${keyHash}, ${String(input.sourceChannel || "smartcommerce")}, ${String(input.sourceApplication || "smartcommerce")},
      ${input.externalId || null}, ${input.itemType.trim()}, ${input.entityType || null}, ${input.entityId || null},
      ${input.customerId || null}, ${input.branchId || null}, ${status}, ${input.priority || "normal"},
      ${input.reviewReason || null}, ${JSON.stringify(input.payload || {})}::jsonb, ${JSON.stringify(input.metadata || {})}::jsonb,
      ${destination.section}, ${destination.resource}, ${destination.label}, ${destination.mode}, ${destination.instructions}
    )
    ON CONFLICT (idempotency_key_hash) DO UPDATE SET
      external_id = COALESCE(EXCLUDED.external_id, omnichannel_intake_items.external_id),
      destination_section = EXCLUDED.destination_section,
      destination_resource = EXCLUDED.destination_resource,
      destination_label = EXCLUDED.destination_label,
      processing_mode = EXCLUDED.processing_mode,
      processing_note = EXCLUDED.processing_note,
      metadata = omnichannel_intake_items.metadata || EXCLUDED.metadata,
      updated_at = NOW()
    RETURNING *
  ` as Array<Record<string, unknown>>;
  await recordChannelEvent({ sourceChannel: input.sourceChannel, sourceApplication: input.sourceApplication, eventType: "export_received", entityType: input.entityType || input.itemType, entityId: input.entityId || input.externalId || null, customerId: input.customerId, branchId: input.branchId, payload: { intakeId: rows[0]?.id, itemType: input.itemType, status, destination: destination.section }, metadata: input.metadata });
  return rows[0];
}

export async function listIntakeItems(input: { status?: string; sourceChannel?: string; limit?: number } = {}) {
  await ensureOmnichannelSchema();
  const limit = Math.max(1, Math.min(500, Number(input.limit || 200)));
  if (input.status && input.sourceChannel) return await sql()`SELECT * FROM omnichannel_intake_items WHERE status = ${input.status} AND source_channel = ${input.sourceChannel} ORDER BY received_at DESC LIMIT ${limit}` as Array<Record<string, unknown>>;
  if (input.status) return await sql()`SELECT * FROM omnichannel_intake_items WHERE status = ${input.status} ORDER BY received_at DESC LIMIT ${limit}` as Array<Record<string, unknown>>;
  if (input.sourceChannel) return await sql()`SELECT * FROM omnichannel_intake_items WHERE source_channel = ${input.sourceChannel} ORDER BY received_at DESC LIMIT ${limit}` as Array<Record<string, unknown>>;
  return await sql()`SELECT * FROM omnichannel_intake_items ORDER BY received_at DESC LIMIT ${limit}` as Array<Record<string, unknown>>;
}

export async function reviewIntakeItem(input: { id: string; decision: "approved" | "rejected"; employeeId: string; note?: string | null }) {
  await ensureOmnichannelSchema();
  const rows = await sql()`
    UPDATE omnichannel_intake_items
    SET status = ${input.decision}, reviewer_employee_id = ${input.employeeId}, reviewer_note = ${input.note || null}, reviewed_at = NOW(), updated_at = NOW()
    WHERE id = ${input.id} AND status IN ('received','review_required','auto_accepted')
    RETURNING *
  ` as Array<Record<string, unknown>>;
  if (!rows[0]) throw new Error("OMNICHANNEL_REVIEW_STATE_CONFLICT");
  await recordChannelEvent({ sourceChannel: "smartcommerce", sourceApplication: "operations", eventType: `review_${input.decision}`, entityType: "intake_item", entityId: input.id, payload: { reviewerEmployeeId: input.employeeId, note: input.note || null } });
  return rows[0];
}

export async function dispatchIntakeItem(input: { id: string; employeeId: string }) {
  await ensureOmnichannelSchema();
  const existing = await sql()`SELECT * FROM omnichannel_intake_items WHERE id = ${input.id} LIMIT 1` as Array<Record<string, any>>;
  const item = existing[0];
  if (!item) throw new Error("OMNICHANNEL_ITEM_NOT_FOUND");
  if (!["approved", "auto_accepted"].includes(String(item.status))) throw new Error("OMNICHANNEL_DISPATCH_STATE_CONFLICT");
  const destination = workflowDestinationForType(String(item.item_type || ""));
  const nextStatus: IntakeStatus = destination.section === "reviews" ? "approved" : "processing";
  const rows = await sql()`
    UPDATE omnichannel_intake_items
    SET status = ${nextStatus}, destination_section = ${destination.section}, destination_resource = ${destination.resource},
        destination_label = ${destination.label}, processing_mode = ${destination.mode}, processing_note = ${destination.instructions},
        dispatched_by_employee_id = ${input.employeeId}, dispatched_at = NOW(), processing_error = NULL, updated_at = NOW()
    WHERE id = ${input.id} AND status IN ('approved','auto_accepted')
    RETURNING *
  ` as Array<Record<string, unknown>>;
  if (!rows[0]) throw new Error("OMNICHANNEL_DISPATCH_STATE_CONFLICT");
  await recordChannelEvent({ sourceChannel: String(item.source_channel || "smartcommerce"), sourceApplication: "operations", eventType: "intake_dispatched", entityType: String(item.item_type || "intake_item"), entityId: input.id, customerId: item.customer_id || null, branchId: item.branch_id || null, payload: { destinationSection: destination.section, destinationResource: destination.resource, mode: destination.mode, employeeId: input.employeeId } });
  return rows[0];
}

export async function markIntakeOutcome(input: { id: string; status: "applied" | "failed"; employeeId: string; downstreamReference?: string | null; error?: string | null }) {
  await ensureOmnichannelSchema();
  const rows = await sql()`
    UPDATE omnichannel_intake_items
    SET status = ${input.status}, downstream_reference = ${input.downstreamReference || null}, processing_error = ${input.error || null}, updated_at = NOW()
    WHERE id = ${input.id} AND status = 'processing'
    RETURNING *
  ` as Array<Record<string, unknown>>;
  if (!rows[0]) throw new Error("OMNICHANNEL_OUTCOME_STATE_CONFLICT");
  await recordChannelEvent({ sourceChannel: "smartcommerce", sourceApplication: "operations", eventType: `intake_${input.status}`, entityType: "intake_item", entityId: input.id, payload: { employeeId: input.employeeId, downstreamReference: input.downstreamReference || null, error: input.error || null } });
  return rows[0];
}

export async function channelReport(input: { start: string; end: string }) {
  await ensureOmnichannelSchema();
  const start = new Date(`${input.start}T00:00:00.000Z`).toISOString();
  const end = new Date(`${input.end}T23:59:59.999Z`).toISOString();
  const [byChannel, byEvent, reviewQueue, intakeByStatus, byDestination] = await Promise.all([
    sql()`SELECT source_channel, COUNT(*)::int AS events FROM omnichannel_events WHERE occurred_at >= ${start} AND occurred_at <= ${end} GROUP BY source_channel ORDER BY events DESC`,
    sql()`SELECT event_type, source_channel, COUNT(*)::int AS events FROM omnichannel_events WHERE occurred_at >= ${start} AND occurred_at <= ${end} GROUP BY event_type, source_channel ORDER BY events DESC`,
    sql()`SELECT id, source_channel, source_application, item_type, entity_type, external_id, status, priority, review_reason, reviewer_employee_id, reviewed_at, destination_section, destination_resource, destination_label, processing_mode, dispatched_by_employee_id, dispatched_at, downstream_reference, processing_error, received_at FROM omnichannel_intake_items WHERE received_at >= ${start} AND received_at <= ${end} ORDER BY received_at DESC LIMIT 500`,
    sql()`SELECT status, source_channel, COUNT(*)::int AS records FROM omnichannel_intake_items WHERE received_at >= ${start} AND received_at <= ${end} GROUP BY status, source_channel ORDER BY records DESC`,
    sql()`SELECT COALESCE(destination_section,'unrouted') AS destination_section, status, COUNT(*)::int AS records FROM omnichannel_intake_items WHERE received_at >= ${start} AND received_at <= ${end} GROUP BY destination_section, status ORDER BY records DESC`,
  ]);
  return { byChannel, byEvent, reviewQueue, intakeByStatus, byDestination };
}
