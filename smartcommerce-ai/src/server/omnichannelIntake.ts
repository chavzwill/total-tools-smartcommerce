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
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS omnichannel_events_source_date_idx ON omnichannel_events(source_channel, occurred_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS omnichannel_events_type_date_idx ON omnichannel_events(event_type, occurred_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS omnichannel_intake_status_date_idx ON omnichannel_intake_items(status, received_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS omnichannel_intake_source_date_idx ON omnichannel_intake_items(source_channel, received_at DESC)`;
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
  const rows = await sql()`
    INSERT INTO omnichannel_intake_items (
      id, idempotency_key_hash, source_channel, source_application, external_id, item_type,
      entity_type, entity_id, customer_id, branch_id, status, priority, review_reason, payload, metadata
    ) VALUES (
      ${id}, ${keyHash}, ${String(input.sourceChannel || "smartcommerce")}, ${String(input.sourceApplication || "smartcommerce")},
      ${input.externalId || null}, ${input.itemType.trim()}, ${input.entityType || null}, ${input.entityId || null},
      ${input.customerId || null}, ${input.branchId || null}, ${status}, ${input.priority || "normal"},
      ${input.reviewReason || null}, ${JSON.stringify(input.payload || {})}::jsonb, ${JSON.stringify(input.metadata || {})}::jsonb
    )
    ON CONFLICT (idempotency_key_hash) DO UPDATE SET
      external_id = COALESCE(EXCLUDED.external_id, omnichannel_intake_items.external_id),
      metadata = omnichannel_intake_items.metadata || EXCLUDED.metadata,
      updated_at = NOW()
    RETURNING *
  ` as Array<Record<string, unknown>>;
  await recordChannelEvent({
    sourceChannel: input.sourceChannel,
    sourceApplication: input.sourceApplication,
    eventType: "export_received",
    entityType: input.entityType || input.itemType,
    entityId: input.entityId || input.externalId || null,
    customerId: input.customerId,
    branchId: input.branchId,
    payload: { intakeId: rows[0]?.id, itemType: input.itemType, status },
    metadata: input.metadata,
  });
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

export async function channelReport(input: { start: string; end: string }) {
  await ensureOmnichannelSchema();
  const start = new Date(`${input.start}T00:00:00.000Z`).toISOString();
  const end = new Date(`${input.end}T23:59:59.999Z`).toISOString();
  const [byChannel, byEvent, reviewQueue, intakeByStatus] = await Promise.all([
    sql()`SELECT source_channel, COUNT(*)::int AS events FROM omnichannel_events WHERE occurred_at >= ${start} AND occurred_at <= ${end} GROUP BY source_channel ORDER BY events DESC`,
    sql()`SELECT event_type, source_channel, COUNT(*)::int AS events FROM omnichannel_events WHERE occurred_at >= ${start} AND occurred_at <= ${end} GROUP BY event_type, source_channel ORDER BY events DESC`,
    sql()`SELECT id, source_channel, source_application, item_type, entity_type, external_id, status, priority, review_reason, reviewer_employee_id, reviewed_at, received_at FROM omnichannel_intake_items WHERE received_at >= ${start} AND received_at <= ${end} ORDER BY received_at DESC LIMIT 500`,
    sql()`SELECT status, source_channel, COUNT(*)::int AS records FROM omnichannel_intake_items WHERE received_at >= ${start} AND received_at <= ${end} GROUP BY status, source_channel ORDER BY records DESC`,
  ]);
  return { byChannel, byEvent, reviewQueue, intakeByStatus };
}
