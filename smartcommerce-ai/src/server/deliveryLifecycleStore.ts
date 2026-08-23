import { neon } from "@neondatabase/serverless";
import { randomBytes } from "node:crypto";

let sqlClient: ReturnType<typeof neon> | undefined;
let schemaReady = false;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("DELIVERY_LIFECYCLE_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

export type DeliveryLifecycleStatus =
  | "order_received"
  | "preparing"
  | "ready_for_collection"
  | "dispatched"
  | "out_for_delivery"
  | "delivered"
  | "collected"
  | "exception";

export type DeliveryProofMethod =
  | "recipient_acknowledgement"
  | "signed_docket"
  | "photo_evidence"
  | "courier_confirmation"
  | "collection_receipt";

const TERMINAL = new Set<DeliveryLifecycleStatus>(["delivered", "collected"]);
const PROOF_METHODS = new Set<DeliveryProofMethod>([
  "recipient_acknowledgement",
  "signed_docket",
  "photo_evidence",
  "courier_confirmation",
  "collection_receipt",
]);

const TRANSITIONS: Record<DeliveryLifecycleStatus, DeliveryLifecycleStatus[]> = {
  order_received: ["preparing", "ready_for_collection", "dispatched", "exception"],
  preparing: ["ready_for_collection", "dispatched", "exception"],
  ready_for_collection: ["collected", "exception"],
  dispatched: ["out_for_delivery", "delivered", "exception"],
  out_for_delivery: ["delivered", "exception"],
  delivered: [],
  collected: [],
  exception: ["preparing", "ready_for_collection", "dispatched", "out_for_delivery"],
};

export async function ensureDeliveryLifecycleSchema() {
  if (schemaReady) return;
  const db = sql();
  await db`
    CREATE TABLE IF NOT EXISTS delivery_lifecycles (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL UNIQUE,
      customer_id TEXT NOT NULL,
      commercial_account_id TEXT,
      fulfilment_mode TEXT NOT NULL,
      provider TEXT,
      service_id TEXT,
      service_label TEXT,
      collection_point_id TEXT,
      collection_point_name TEXT,
      status TEXT NOT NULL DEFAULT 'order_received',
      scheduled_for TIMESTAMPTZ,
      tracking_reference TEXT,
      exception_message TEXT,
      completed_at TIMESTAMPTZ,
      proof_recipient_name TEXT,
      proof_method TEXT,
      proof_reference TEXT,
      proof_notes TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await db`ALTER TABLE delivery_lifecycles ADD COLUMN IF NOT EXISTS proof_method TEXT`;
  await db`
    CREATE TABLE IF NOT EXISTS delivery_lifecycle_events (
      id TEXT PRIMARY KEY,
      lifecycle_id TEXT NOT NULL REFERENCES delivery_lifecycles(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      actor_id TEXT,
      public_message TEXT,
      internal_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS delivery_lifecycles_customer_idx ON delivery_lifecycles(customer_id, updated_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS delivery_lifecycles_status_idx ON delivery_lifecycles(status, updated_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS delivery_lifecycle_events_lifecycle_idx ON delivery_lifecycle_events(lifecycle_id, created_at ASC)`;
  schemaReady = true;
}

function text(value: unknown, max = 180) {
  return String(value || "").trim().slice(0, max);
}

function jsonObject(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === "string") {
    try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" ? parsed : {}; } catch { return {}; }
  }
  return typeof value === "object" ? value as Record<string, any> : {};
}

async function insertInitialEvent(lifecycleId: string) {
  const id = `dle_${randomBytes(16).toString("hex")}`;
  await sql()`
    INSERT INTO delivery_lifecycle_events (id, lifecycle_id, status, actor_type, public_message)
    VALUES (${id}, ${lifecycleId}, 'order_received', 'system', 'Order received and awaiting fulfilment preparation.')
    ON CONFLICT DO NOTHING
  `;
}

export async function bootstrapDeliveryLifecycle(orderId: string, customerId?: string) {
  await ensureDeliveryLifecycleSchema();
  const db = sql();
  const existing = await db`
    SELECT * FROM delivery_lifecycles
    WHERE order_id = ${orderId}
      ${customerId ? db`AND customer_id = ${customerId}` : db``}
    LIMIT 1
  ` as unknown as Array<any>;
  if (existing[0]) return existing[0];

  const ledger = await db`
    SELECT order_id, customer_id, commercial_account_id, metadata, occurred_at
    FROM commercial_account_ledger_entries
    WHERE order_id = ${orderId}
      AND entry_type = 'order_charge'
      ${customerId ? db`AND customer_id = ${customerId}` : db``}
    ORDER BY occurred_at DESC
    LIMIT 1
  ` as unknown as Array<any>;
  const source = ledger[0];
  if (!source?.order_id || !source?.customer_id) return null;
  const metadata = jsonObject(source.metadata);
  const mode = text(metadata.fulfilmentMode, 32) || "pickup";
  const id = `dlc_${randomBytes(16).toString("hex")}`;
  const rows = await db`
    INSERT INTO delivery_lifecycles (
      id, order_id, customer_id, commercial_account_id, fulfilment_mode,
      provider, service_id, service_label, collection_point_id, collection_point_name, metadata, created_at, updated_at
    ) VALUES (
      ${id}, ${source.order_id}, ${source.customer_id}, ${source.commercial_account_id || null}, ${mode},
      ${text(metadata.deliveryProvider) || null}, ${text(metadata.deliveryServiceId) || null}, ${text(metadata.deliveryServiceLabel) || null},
      ${text(metadata.collectionPointId) || null}, ${text(metadata.collectionPointName) || null}, ${JSON.stringify(metadata)}::jsonb,
      ${source.occurred_at || new Date().toISOString()}, NOW()
    )
    ON CONFLICT (order_id) DO NOTHING
    RETURNING *
  ` as unknown as Array<any>;
  const lifecycle = rows[0] || (await db`SELECT * FROM delivery_lifecycles WHERE order_id = ${orderId} LIMIT 1` as unknown as Array<any>)[0];
  if (lifecycle) await insertInitialEvent(lifecycle.id);
  return lifecycle || null;
}

export async function bootstrapRecentDeliveryLifecycles(limit = 100) {
  await ensureDeliveryLifecycleSchema();
  const rows = await sql()`
    SELECT DISTINCT ON (order_id) order_id
    FROM commercial_account_ledger_entries
    WHERE entry_type = 'order_charge' AND order_id IS NOT NULL
    ORDER BY order_id, occurred_at DESC
    LIMIT ${Math.max(1, Math.min(250, Math.trunc(limit)))}
  ` as unknown as Array<{ order_id: string }>;
  for (const row of rows) await bootstrapDeliveryLifecycle(row.order_id);
}

export async function getDeliveryLifecycleForCustomer(orderId: string, customerId: string) {
  const lifecycle = await bootstrapDeliveryLifecycle(orderId, customerId);
  if (!lifecycle) return null;
  const events = await sql()`
    SELECT status, public_message, created_at
    FROM delivery_lifecycle_events
    WHERE lifecycle_id = ${lifecycle.id}
    ORDER BY created_at ASC
  ` as unknown as Array<any>;
  return { lifecycle, events };
}

export async function listDeliveryLifecycles(status?: string) {
  await bootstrapRecentDeliveryLifecycles();
  const value = text(status, 40);
  return await sql()`
    SELECT * FROM delivery_lifecycles
    WHERE (${value || "all"} = 'all' OR status = ${value || "all"})
    ORDER BY updated_at DESC
    LIMIT 150
  ` as unknown as Array<any>;
}

export async function updateDeliveryLifecycle(input: {
  orderId: string;
  status: DeliveryLifecycleStatus;
  actorId: string;
  publicMessage?: string;
  internalNote?: string;
  provider?: string;
  serviceLabel?: string;
  trackingReference?: string;
  scheduledFor?: string | null;
  exceptionMessage?: string | null;
  proofRecipientName?: string;
  proofMethod?: DeliveryProofMethod;
  proofReference?: string;
  proofNotes?: string;
}) {
  const lifecycle = await bootstrapDeliveryLifecycle(input.orderId);
  if (!lifecycle) throw new Error("DELIVERY_ORDER_NOT_FOUND");
  const current = lifecycle.status as DeliveryLifecycleStatus;
  if (current !== input.status && !TRANSITIONS[current]?.includes(input.status)) throw new Error("DELIVERY_STATUS_TRANSITION_INVALID");

  const terminal = TERMINAL.has(input.status);
  const recipient = text(input.proofRecipientName, 120);
  const proofMethod = text(input.proofMethod, 40) as DeliveryProofMethod;
  const proofReference = text(input.proofReference, 180);
  if (terminal && !recipient) throw new Error("DELIVERY_PROOF_RECIPIENT_REQUIRED");
  if (terminal && !PROOF_METHODS.has(proofMethod)) throw new Error("DELIVERY_PROOF_METHOD_REQUIRED");
  if (terminal && proofMethod !== "recipient_acknowledgement" && !proofReference) throw new Error("DELIVERY_PROOF_REFERENCE_REQUIRED");

  const completedAt = terminal ? new Date().toISOString() : null;
  const rows = await sql()`
    UPDATE delivery_lifecycles
    SET status = ${input.status},
        provider = COALESCE(${text(input.provider) || null}, provider),
        service_label = COALESCE(${text(input.serviceLabel) || null}, service_label),
        tracking_reference = COALESCE(${text(input.trackingReference, 120) || null}, tracking_reference),
        scheduled_for = ${input.scheduledFor || null},
        exception_message = ${input.status === "exception" ? text(input.exceptionMessage, 500) || "Delivery requires staff attention." : null},
        completed_at = ${completedAt},
        proof_recipient_name = ${terminal ? recipient : null},
        proof_method = ${terminal ? proofMethod : null},
        proof_reference = ${terminal ? proofReference || null : null},
        proof_notes = ${terminal ? text(input.proofNotes, 500) || null : null},
        updated_at = NOW()
    WHERE id = ${lifecycle.id}
    RETURNING *
  ` as unknown as Array<any>;

  const eventId = `dle_${randomBytes(16).toString("hex")}`;
  await sql()`
    INSERT INTO delivery_lifecycle_events (id, lifecycle_id, status, actor_type, actor_id, public_message, internal_note)
    VALUES (${eventId}, ${lifecycle.id}, ${input.status}, 'staff', ${text(input.actorId, 120)}, ${text(input.publicMessage, 500) || null}, ${text(input.internalNote, 1000) || null})
  `;
  return rows[0];
}
