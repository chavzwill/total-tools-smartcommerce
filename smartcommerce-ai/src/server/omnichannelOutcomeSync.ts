import { neon } from "@neondatabase/serverless";
import { createHardenedServerFetch, validateServerIntegrationBaseUrl } from "./hardenedOutboundFetch.js";
import { recordChannelEvent } from "./omnichannelIntake.js";

let sqlClient: ReturnType<typeof neon> | undefined;
let schemaReady = false;
type Row = Record<string, any>;

const ALLOWED_RESOURCES = new Set([
  "transactions", "quotations", "work-orders", "rentals", "purchase-requests", "purchase-orders", "transfers",
]);

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("OMNICHANNEL_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

function configuredPos() {
  const raw = process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_URL?.trim();
  if (!raw) throw new Error("POS_NOT_CONFIGURED");
  return validateServerIntegrationBaseUrl(raw).toString().replace(/\/$/, "");
}

async function ensureSchema() {
  if (schemaReady) return;
  await sql()`CREATE TABLE IF NOT EXISTS omnichannel_outcome_links (
    intake_id TEXT PRIMARY KEY,
    item_type TEXT NOT NULL,
    source_channel TEXT NOT NULL,
    customer_id TEXT,
    branch_id TEXT,
    resource TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    reference TEXT,
    authoritative_status TEXT,
    fulfillment_status TEXT,
    safe_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_sync_error TEXT,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_synced_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql()`CREATE INDEX IF NOT EXISTS omnichannel_outcome_customer_idx ON omnichannel_outcome_links(customer_id, updated_at DESC)`;
  await sql()`CREATE INDEX IF NOT EXISTS omnichannel_outcome_resource_idx ON omnichannel_outcome_links(resource, authoritative_status, updated_at DESC)`;
  schemaReady = true;
}

function safeStatus(resource: string, row: Row) {
  const status = String(row.status || row.state || "unknown").trim().toLowerCase();
  const fulfillment = String(row.fulfillment_status || row.fulfillment || "").trim().toLowerCase() || null;
  const snapshot: Row = {
    status,
    fulfillmentStatus: fulfillment,
    reference: row.transaction_number || row.quote_number || row.wo_number || row.reservation_number || row.rental_number || row.agreement_number || row.pr_number || row.po_number || row.transfer_number || row.id || null,
    updatedAt: row.updated_at || row.completed_at || row.received_at || row.returned_at || row.created_at || null,
  };
  if (resource === "transactions") {
    snapshot.total = Number.isFinite(Number(row.total)) ? Number(row.total) : undefined;
    snapshot.paymentMethod = row.payment_method || undefined;
    snapshot.voidedAt = row.voided_at || undefined;
  } else if (resource === "work-orders") {
    snapshot.itemLabel = row.item_label || undefined;
    snapshot.pickupDueDate = row.pickup_due_date || undefined;
    snapshot.completedAt = row.completed_at || undefined;
  } else if (resource === "rentals") {
    snapshot.startAt = row.start_at || row.checkout_datetime || undefined;
    snapshot.endAt = row.end_at || row.due_date || undefined;
    snapshot.returnedAt = row.returned_at || undefined;
  } else if (resource === "quotations") {
    snapshot.validUntil = row.valid_until || undefined;
    snapshot.convertedToTransaction = row.converted_to_tx || undefined;
  } else if (resource === "purchase-orders") {
    snapshot.expectedDate = row.expected_date || undefined;
    snapshot.receivedAt = row.received_at || undefined;
  } else if (resource === "transfers") {
    snapshot.dispatchedAt = row.dispatched_at || undefined;
    snapshot.receivedAt = row.received_at || undefined;
  }
  return { status, fulfillment, snapshot };
}

async function posGet(resource: string, entityId: string) {
  if (!ALLOWED_RESOURCES.has(resource)) throw new Error("OMNICHANNEL_OUTCOME_RESOURCE_UNSUPPORTED");
  const url = new URL(`${configuredPos()}/api/${resource}/${encodeURIComponent(entityId)}`);
  const headers: Record<string, string> = { Accept: "application/json" };
  const key = process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_API_KEY?.trim();
  if (key) headers["X-API-Key"] = key;
  const fetcher = createHardenedServerFetch({ timeoutMs: 9000, maxResponseBytes: 1_500_000 });
  const response = await fetcher(url, { headers });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`POS_OUTCOME_SYNC_${response.status}`);
  return await response.json() as Row;
}

export async function registerOutcomeLink(input: { intakeId: string; itemType: string; resource: string; entityId: string; reference?: string | null }) {
  await ensureSchema();
  if (!ALLOWED_RESOURCES.has(input.resource)) throw new Error("OMNICHANNEL_OUTCOME_RESOURCE_UNSUPPORTED");
  const intake = await sql()`SELECT id,item_type,source_channel,customer_id,branch_id FROM omnichannel_intake_items WHERE id=${input.intakeId} LIMIT 1` as Row[];
  if (!intake[0]) throw new Error("OMNICHANNEL_ITEM_NOT_FOUND");
  const row = intake[0];
  const links = await sql()`INSERT INTO omnichannel_outcome_links(
      intake_id,item_type,source_channel,customer_id,branch_id,resource,entity_id,reference
    ) VALUES(
      ${input.intakeId},${String(row.item_type || input.itemType)},${String(row.source_channel || "smartcommerce")},${row.customer_id || null},${row.branch_id || null},${input.resource},${input.entityId},${input.reference || null}
    ) ON CONFLICT(intake_id) DO UPDATE SET resource=EXCLUDED.resource,entity_id=EXCLUDED.entity_id,reference=COALESCE(EXCLUDED.reference,omnichannel_outcome_links.reference),updated_at=NOW()
    RETURNING *` as Row[];
  await recordChannelEvent({ sourceChannel: String(row.source_channel || "smartcommerce"), sourceApplication: "operations", eventType: "downstream_link_registered", entityType: input.resource, entityId: input.entityId, customerId: row.customer_id || null, branchId: row.branch_id || null, payload: { intakeId: input.intakeId, reference: input.reference || null } });
  return links[0];
}

export async function refreshOutcomeLink(intakeId: string) {
  await ensureSchema();
  const links = await sql()`SELECT * FROM omnichannel_outcome_links WHERE intake_id=${intakeId} LIMIT 1` as Row[];
  const link = links[0];
  if (!link) throw new Error("OMNICHANNEL_OUTCOME_LINK_NOT_FOUND");
  try {
    const upstream = await posGet(String(link.resource), String(link.entity_id));
    const previousStatus = String(link.authoritative_status || "");
    if (!upstream) {
      const rows = await sql()`UPDATE omnichannel_outcome_links SET authoritative_status='not_found',last_sync_error=NULL,last_synced_at=NOW(),updated_at=NOW() WHERE intake_id=${intakeId} RETURNING *` as Row[];
      return rows[0];
    }
    const normalized = safeStatus(String(link.resource), upstream);
    const rows = await sql()`UPDATE omnichannel_outcome_links SET authoritative_status=${normalized.status},fulfillment_status=${normalized.fulfillment},safe_snapshot=${JSON.stringify(normalized.snapshot)}::jsonb,last_sync_error=NULL,last_synced_at=NOW(),updated_at=NOW() WHERE intake_id=${intakeId} RETURNING *` as Row[];
    if (normalized.status !== previousStatus || String(link.fulfillment_status || "") !== String(normalized.fulfillment || "")) {
      await recordChannelEvent({ sourceChannel: String(link.source_channel || "smartcommerce"), sourceApplication: "outcome-sync", eventType: "downstream_status_changed", entityType: String(link.resource), entityId: String(link.entity_id), customerId: link.customer_id || null, branchId: link.branch_id || null, payload: { intakeId, reference: link.reference || null, previousStatus: previousStatus || null, status: normalized.status, fulfillmentStatus: normalized.fulfillment } });
    }
    return rows[0];
  } catch (error) {
    const message = error instanceof Error ? error.message : "OUTCOME_SYNC_FAILED";
    const rows = await sql()`UPDATE omnichannel_outcome_links SET last_sync_error=${message.slice(0,500)},last_synced_at=NOW(),updated_at=NOW() WHERE intake_id=${intakeId} RETURNING *` as Row[];
    return rows[0];
  }
}

export async function listOutcomeLinks(input: { customerIds?: string[]; limit?: number; refresh?: boolean } = {}) {
  await ensureSchema();
  const limit = Math.max(1, Math.min(200, Number(input.limit || 100)));
  let rows: Row[];
  if (input.customerIds?.length) {
    const ids = input.customerIds.map(String).filter(Boolean);
    rows = await sql()`SELECT * FROM omnichannel_outcome_links WHERE customer_id = ANY(${ids}::text[]) ORDER BY updated_at DESC LIMIT ${limit}` as Row[];
  } else {
    rows = await sql()`SELECT * FROM omnichannel_outcome_links ORDER BY updated_at DESC LIMIT ${limit}` as Row[];
  }
  if (input.refresh) {
    const refreshed: Row[] = [];
    for (const row of rows.slice(0, 50)) refreshed.push(await refreshOutcomeLink(String(row.intake_id)));
    return refreshed.concat(rows.slice(50));
  }
  return rows;
}
