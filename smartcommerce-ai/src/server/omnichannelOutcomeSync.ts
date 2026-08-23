import { neon } from "@neondatabase/serverless";
import { createHardenedServerFetch, validateServerIntegrationBaseUrl } from "./hardenedOutboundFetch.js";
import { recordChannelEvent } from "./omnichannelIntake.js";

let sqlClient: ReturnType<typeof neon> | undefined;
let schemaReady = false;
type Row = Record<string, any>;

const ALLOWED_RESOURCES = new Set([
  "transactions", "quotations", "work-orders", "rentals", "purchase-requests", "purchase-orders", "transfers",
]);
const REFERENCE_FIELDS: Record<string, string[]> = {
  transactions: ["transaction_number"], quotations: ["quote_number"], "work-orders": ["wo_number"],
  rentals: ["reservation_number", "rental_number", "agreement_number"], "purchase-requests": ["pr_number"],
  "purchase-orders": ["po_number"], transfers: ["transfer_number"],
};
const RETRY_DELAYS_SECONDS = [60, 300, 900, 3600, 14400, 43200];

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

function posHeaders() {
  const headers: Record<string, string> = { Accept: "application/json" };
  const key = process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_API_KEY?.trim();
  if (key) headers["X-API-Key"] = key;
  return headers;
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
    sync_attempt_count INTEGER NOT NULL DEFAULT 0,
    last_sync_attempt_at TIMESTAMPTZ,
    next_retry_at TIMESTAMPTZ,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_synced_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql()`ALTER TABLE omnichannel_outcome_links ADD COLUMN IF NOT EXISTS sync_attempt_count INTEGER NOT NULL DEFAULT 0`;
  await sql()`ALTER TABLE omnichannel_outcome_links ADD COLUMN IF NOT EXISTS last_sync_attempt_at TIMESTAMPTZ`;
  await sql()`ALTER TABLE omnichannel_outcome_links ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ`;
  await sql()`CREATE INDEX IF NOT EXISTS omnichannel_outcome_customer_idx ON omnichannel_outcome_links(customer_id, updated_at DESC)`;
  await sql()`CREATE INDEX IF NOT EXISTS omnichannel_outcome_resource_idx ON omnichannel_outcome_links(resource, authoritative_status, updated_at DESC)`;
  await sql()`CREATE INDEX IF NOT EXISTS omnichannel_outcome_retry_idx ON omnichannel_outcome_links(next_retry_at, updated_at) WHERE last_sync_error IS NOT NULL`;
  schemaReady = true;
}

function retryDelaySeconds(attemptCount: number) {
  return RETRY_DELAYS_SECONDS[Math.min(Math.max(0, attemptCount - 1), RETRY_DELAYS_SECONDS.length - 1)];
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
  const fetcher = createHardenedServerFetch({ timeoutMs: 9000, maxResponseBytes: 1_500_000 });
  const response = await fetcher(url, { headers: posHeaders() });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`POS_OUTCOME_SYNC_${response.status}`);
  return await response.json() as Row;
}

async function resolveEntityId(resource: string, reference: string) {
  const trimmed = String(reference || "").trim();
  if (!trimmed || !ALLOWED_RESOURCES.has(resource)) return null;
  if (/^\d+$/.test(trimmed)) {
    const direct = await posGet(resource, trimmed).catch(() => null);
    if (direct) return String(direct.id || trimmed);
  }
  const url = new URL(`${configuredPos()}/api/${resource}`);
  if (resource === "transactions") url.searchParams.set("transaction_number", trimmed);
  url.searchParams.set("limit", "500");
  const fetcher = createHardenedServerFetch({ timeoutMs: 9000, maxResponseBytes: 2_000_000 });
  const response = await fetcher(url, { headers: posHeaders() });
  if (!response.ok) return null;
  const payload = await response.json() as any;
  const rows: Row[] = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.items) ? payload.items : [];
  const fields = REFERENCE_FIELDS[resource] || [];
  const exact = rows.find((row) => fields.some((field) => String(row[field] || "").trim() === trimmed));
  return exact?.id !== undefined ? String(exact.id) : null;
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

async function bootstrapMissingLinks(customerIds?: string[]) {
  await ensureSchema();
  let candidates: Row[];
  if (customerIds?.length) {
    candidates = await sql()`SELECT i.* FROM omnichannel_intake_items i LEFT JOIN omnichannel_outcome_links o ON o.intake_id=i.id WHERE o.intake_id IS NULL AND i.status='applied' AND i.downstream_reference IS NOT NULL AND i.destination_resource = ANY(${Array.from(ALLOWED_RESOURCES)}::text[]) AND i.customer_id = ANY(${customerIds}::text[]) ORDER BY i.updated_at DESC LIMIT 50` as Row[];
  } else {
    candidates = await sql()`SELECT i.* FROM omnichannel_intake_items i LEFT JOIN omnichannel_outcome_links o ON o.intake_id=i.id WHERE o.intake_id IS NULL AND i.status='applied' AND i.downstream_reference IS NOT NULL AND i.destination_resource = ANY(${Array.from(ALLOWED_RESOURCES)}::text[]) ORDER BY i.updated_at DESC LIMIT 50` as Row[];
  }
  for (const item of candidates) {
    const resource = String(item.destination_resource || "");
    const reference = String(item.downstream_reference || "");
    const entityId = await resolveEntityId(resource, reference).catch(() => null);
    if (!entityId) continue;
    await registerOutcomeLink({ intakeId: String(item.id), itemType: String(item.item_type || ""), resource, entityId, reference }).catch(() => undefined);
  }
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
      const rows = await sql()`UPDATE omnichannel_outcome_links SET authoritative_status='not_found',last_sync_error=NULL,sync_attempt_count=0,last_sync_attempt_at=NOW(),next_retry_at=NULL,last_synced_at=NOW(),updated_at=NOW() WHERE intake_id=${intakeId} RETURNING *` as Row[];
      return rows[0];
    }
    const normalized = safeStatus(String(link.resource), upstream);
    const rows = await sql()`UPDATE omnichannel_outcome_links SET authoritative_status=${normalized.status},fulfillment_status=${normalized.fulfillment},safe_snapshot=${JSON.stringify(normalized.snapshot)}::jsonb,last_sync_error=NULL,sync_attempt_count=0,last_sync_attempt_at=NOW(),next_retry_at=NULL,last_synced_at=NOW(),updated_at=NOW() WHERE intake_id=${intakeId} RETURNING *` as Row[];
    if (normalized.status !== previousStatus || String(link.fulfillment_status || "") !== String(normalized.fulfillment || "")) {
      await recordChannelEvent({ sourceChannel: String(link.source_channel || "smartcommerce"), sourceApplication: "outcome-sync", eventType: "downstream_status_changed", entityType: String(link.resource), entityId: String(link.entity_id), customerId: link.customer_id || null, branchId: link.branch_id || null, payload: { intakeId, reference: link.reference || null, previousStatus: previousStatus || null, status: normalized.status, fulfillmentStatus: normalized.fulfillment } });
    }
    return rows[0];
  } catch (error) {
    const message = error instanceof Error ? error.message : "OUTCOME_SYNC_FAILED";
    const attempts = Math.max(1, Number(link.sync_attempt_count || 0) + 1);
    const nextRetryAt = new Date(Date.now() + retryDelaySeconds(attempts) * 1000).toISOString();
    const rows = await sql()`UPDATE omnichannel_outcome_links SET last_sync_error=${message.slice(0,500)},sync_attempt_count=${attempts},last_sync_attempt_at=NOW(),next_retry_at=${nextRetryAt}::timestamptz,last_synced_at=NOW(),updated_at=NOW() WHERE intake_id=${intakeId} RETURNING *` as Row[];
    await recordChannelEvent({ sourceChannel: String(link.source_channel || "smartcommerce"), sourceApplication: "outcome-sync", eventType: "downstream_sync_failed", entityType: String(link.resource), entityId: String(link.entity_id), customerId: link.customer_id || null, branchId: link.branch_id || null, payload: { intakeId, reference: link.reference || null, attempt: attempts, nextRetryAt, error: message.slice(0,160) } }).catch(() => undefined);
    return rows[0];
  }
}

// This recovery path is deliberately read-only. It only reissues authoritative
// POS GET/status synchronization. It must never call the Operations mutation
// gateway or retry a stock/payment/business write; uncertain mutations remain
// owned by Operations Recovery & Reconciliation.
export async function retryFailedOutcomeLinks(input: { limit?: number } = {}) {
  await ensureSchema();
  const limit = Math.max(1, Math.min(100, Number(input.limit || 25)));
  const due = await sql()`SELECT intake_id FROM omnichannel_outcome_links WHERE last_sync_error IS NOT NULL AND (next_retry_at IS NULL OR next_retry_at <= NOW()) ORDER BY COALESCE(next_retry_at,updated_at) ASC LIMIT ${limit}` as Array<{ intake_id: string }>;
  const results: Row[] = [];
  for (const row of due) results.push(await refreshOutcomeLink(String(row.intake_id)));
  return {
    attempted: due.length,
    recovered: results.filter((row) => !row.last_sync_error).length,
    stillFailing: results.filter((row) => Boolean(row.last_sync_error)).length,
    outcomes: results,
  };
}

export async function listOutcomeLinks(input: { customerIds?: string[]; limit?: number; refresh?: boolean } = {}) {
  await ensureSchema();
  const limit = Math.max(1, Math.min(200, Number(input.limit || 100)));
  await bootstrapMissingLinks(input.customerIds);
  let rows: Row[];
  if (input.customerIds?.length) {
    const ids = input.customerIds.map(String).filter(Boolean);
    rows = await sql()`SELECT * FROM omnichannel_outcome_links WHERE customer_id = ANY(${ids}::text[]) ORDER BY updated_at DESC LIMIT ${limit}` as Row[];
  } else {
    rows = await sql()`SELECT * FROM omnichannel_outcome_links ORDER BY updated_at DESC LIMIT ${limit}` as Row[];
  }
  if (input.refresh) {
    const refreshed: Row[] = [];
    for (const row of rows.slice(0, 50)) {
      if (row.last_sync_error && row.next_retry_at && new Date(row.next_retry_at).getTime() > Date.now()) refreshed.push(row);
      else refreshed.push(await refreshOutcomeLink(String(row.intake_id)));
    }
    return refreshed.concat(rows.slice(50));
  }
  return rows;
}
