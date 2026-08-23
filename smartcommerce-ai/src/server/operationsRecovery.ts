import { neon } from "@neondatabase/serverless";
import { recordSecurityEvent } from "./securityInfrastructure.js";

let sqlClient: ReturnType<typeof neon> | undefined;
let schemaReady: Promise<void> | undefined;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("OPERATIONS_RECOVERY_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql()`ALTER TABLE operations_mutation_idempotency ADD COLUMN IF NOT EXISTS recovery_status TEXT`;
      await sql()`ALTER TABLE operations_mutation_idempotency ADD COLUMN IF NOT EXISTS recovery_note TEXT`;
      await sql()`ALTER TABLE operations_mutation_idempotency ADD COLUMN IF NOT EXISTS recovered_by_actor_id TEXT`;
      await sql()`ALTER TABLE operations_mutation_idempotency ADD COLUMN IF NOT EXISTS recovered_at TIMESTAMPTZ`;
      await sql()`ALTER TABLE operations_mutation_idempotency ADD COLUMN IF NOT EXISTS recovery_reference TEXT`;
      await sql()`CREATE INDEX IF NOT EXISTS operations_mutation_recovery_idx ON operations_mutation_idempotency(state,recovery_status,updated_at DESC)`;
    })();
  }
  await schemaReady;
}

export type RecoveryMutation = {
  record_key: string;
  actor_id: string;
  operation: string;
  state: string;
  response_status: number | null;
  created_at: string | Date;
  updated_at: string | Date;
  expires_at: string | Date;
  recovery_status: string | null;
  recovery_note: string | null;
  recovered_by_actor_id: string | null;
  recovered_at: string | Date | null;
  recovery_reference: string | null;
};

export async function listOperationsRecovery(limit = 100) {
  await ensureSchema();
  const safeLimit = Math.max(1, Math.min(300, Math.floor(limit || 100)));
  return sql()`
    SELECT record_key,actor_id,operation,state,response_status,created_at,updated_at,expires_at,
           recovery_status,recovery_note,recovered_by_actor_id,recovered_at,recovery_reference
    FROM operations_mutation_idempotency
    WHERE state='processing'
      AND (response_status >= 500 OR updated_at < NOW() - INTERVAL '45 seconds')
    ORDER BY updated_at DESC
    LIMIT ${safeLimit}
  ` as Promise<RecoveryMutation[]>;
}

export async function getOperationsRecovery(recordKey: string) {
  await ensureSchema();
  const rows = await sql()`
    SELECT record_key,actor_id,operation,state,response_status,created_at,updated_at,expires_at,
           recovery_status,recovery_note,recovered_by_actor_id,recovered_at,recovery_reference
    FROM operations_mutation_idempotency
    WHERE record_key=${recordKey}
    LIMIT 1
  ` as RecoveryMutation[];
  return rows[0] || null;
}

export async function resolveOperationsRecovery(input: {
  recordKey: string;
  actorId: string;
  resolution: "confirmed_committed" | "release_retry";
  note: string;
  reference?: string | null;
}) {
  await ensureSchema();
  const existing = await getOperationsRecovery(input.recordKey);
  if (!existing || existing.state !== "processing") throw new Error("OPERATIONS_RECOVERY_NOT_FOUND");
  const note = input.note.trim().slice(0, 1200);
  if (note.length < 8) throw new Error("OPERATIONS_RECOVERY_NOTE_REQUIRED");
  const reference = String(input.reference || "").trim().slice(0, 240) || null;

  if (input.resolution === "release_retry") {
    await recordSecurityEvent({
      eventType: "staff_operations_recovery_retry_released",
      eventStatus: "approved",
      riskLevel: "high",
      subject: input.actorId,
      metadata: { recordKey: input.recordKey.slice(0, 16), operation: existing.operation, note, reference },
    }).catch(() => undefined);
    await sql()`DELETE FROM operations_mutation_idempotency WHERE record_key=${input.recordKey} AND state='processing'`;
    return { record_key: input.recordKey, resolution: input.resolution, released: true };
  }

  const body = JSON.stringify({ success: true, recovered: true, operation: existing.operation, reference, message: "The authoritative POS outcome was confirmed by management recovery review." });
  const rows = await sql()`
    UPDATE operations_mutation_idempotency
    SET state='completed',
        response_status=208,
        response_content_type='application/json',
        response_body_base64=${Buffer.from(body).toString("base64")},
        recovery_status='confirmed_committed',
        recovery_note=${note},
        recovered_by_actor_id=${input.actorId},
        recovered_at=NOW(),
        recovery_reference=${reference},
        updated_at=NOW()
    WHERE record_key=${input.recordKey} AND state='processing'
    RETURNING record_key,operation,recovery_status,recovery_note,recovery_reference,recovered_at
  ` as Array<Record<string, unknown>>;
  if (!rows[0]) throw new Error("OPERATIONS_RECOVERY_STATE_CONFLICT");
  await recordSecurityEvent({
    eventType: "staff_operations_recovery_confirmed_committed",
    eventStatus: "success",
    riskLevel: "high",
    subject: input.actorId,
    metadata: { recordKey: input.recordKey.slice(0, 16), operation: existing.operation, note, reference },
  }).catch(() => undefined);
  return rows[0];
}

export function recoveryEntityPath(operation: string) {
  const colon = operation.indexOf(":");
  const raw = colon >= 0 ? operation.slice(colon + 1) : operation;
  const segments = raw.split("/").filter(Boolean);
  if (segments.length < 2) return null;
  const resource = segments[0];
  const id = segments[1];
  if (!id || ["hold", "sessions", "active-tasks", "schedule"].includes(id)) return null;
  const supported = new Set(["work-orders", "inventory", "purchase-requests", "purchase-orders", "transfers", "quotations", "transactions", "drawers", "rentals", "customers"]);
  return supported.has(resource) ? `${resource}/${id}` : null;
}
