import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import { recordSecurityEvent } from "./securityInfrastructure.js";

let sqlClient: ReturnType<typeof neon> | undefined;
let schemaReady: Promise<void> | undefined;

type Replay = { status: number; contentType: string; body: Buffer };
export type MutationClaim = { recordKey: string; replay?: Replay; inProgress?: boolean };
type MutationContext = { actorId: string; operation: string };

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("OPERATIONS_IDEMPOTENCY_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql()`CREATE TABLE IF NOT EXISTS operations_mutation_idempotency (
        record_key TEXT PRIMARY KEY,
        actor_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        key_hash TEXT NOT NULL,
        request_fingerprint TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('processing','completed')),
        response_status INTEGER,
        response_content_type TEXT,
        response_body_base64 TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
      )`;
      await sql()`CREATE INDEX IF NOT EXISTS operations_mutation_idempotency_expiry_idx ON operations_mutation_idempotency(expires_at)`;
      await sql()`CREATE INDEX IF NOT EXISTS operations_mutation_actor_created_idx ON operations_mutation_idempotency(actor_id,created_at DESC)`;
      await sql()`CREATE INDEX IF NOT EXISTS operations_mutation_operation_created_idx ON operations_mutation_idempotency(operation,created_at DESC)`;
    })();
  }
  await schemaReady;
}

async function mutationContext(recordKey: string): Promise<MutationContext | null> {
  const rows = await sql()`SELECT actor_id,operation FROM operations_mutation_idempotency WHERE record_key=${recordKey} LIMIT 1` as Array<{ actor_id: string; operation: string }>;
  return rows[0] ? { actorId: String(rows[0].actor_id), operation: String(rows[0].operation) } : null;
}

async function audit(context: MutationContext | null, eventType: string, eventStatus: string, metadata: Record<string, unknown>) {
  if (!context) return;
  await recordSecurityEvent({
    eventType,
    eventStatus,
    riskLevel: eventStatus === "blocked" || eventStatus === "failed" ? "high" : "medium",
    subject: context.actorId,
    metadata: { operation: context.operation, ...metadata },
  }).catch(() => undefined);
}

export function validIdempotencyKey(value: unknown) {
  const key = String(value || "").trim();
  return key.length >= 12 && key.length <= 200 ? key : "";
}

export async function claimOperationsMutation(input: {
  actorId: string;
  operation: string;
  idempotencyKey: string;
  method: string;
  pathname: string;
  body?: Buffer;
  ttlHours?: number;
}): Promise<MutationClaim> {
  await ensureSchema();
  const keyHash = hash(input.idempotencyKey);
  const requestFingerprint = hash(Buffer.concat([
    Buffer.from(`${input.method}:${input.pathname}:`, "utf8"),
    input.body || Buffer.alloc(0),
  ]));
  const recordKey = hash(`${input.actorId}:${input.operation}:${keyHash}`);
  const expiresAt = new Date(Date.now() + Math.max(1, Math.min(168, input.ttlHours || 24)) * 3600000).toISOString();

  const inserted = await sql()`INSERT INTO operations_mutation_idempotency(
      record_key,actor_id,operation,key_hash,request_fingerprint,state,expires_at
    ) VALUES(${recordKey},${input.actorId},${input.operation},${keyHash},${requestFingerprint},'processing',${expiresAt}::timestamptz)
    ON CONFLICT(record_key) DO NOTHING RETURNING record_key` as Array<{ record_key: string }>;
  if (inserted[0]) {
    await audit({ actorId: input.actorId, operation: input.operation }, "staff_operations_mutation_started", "processing", { recordKey: recordKey.slice(0, 16) });
    return { recordKey };
  }

  const found = await sql()`SELECT request_fingerprint,state,response_status,response_content_type,response_body_base64,expires_at
    FROM operations_mutation_idempotency WHERE record_key=${recordKey} LIMIT 1` as Array<Record<string, any>>;
  const existing = found[0];
  if (!existing || new Date(existing.expires_at).getTime() <= Date.now()) {
    await sql()`DELETE FROM operations_mutation_idempotency WHERE record_key=${recordKey}`;
    return claimOperationsMutation(input);
  }
  if (String(existing.request_fingerprint) !== requestFingerprint) {
    await audit({ actorId: input.actorId, operation: input.operation }, "staff_operations_idempotency_conflict", "blocked", { recordKey: recordKey.slice(0, 16) });
    throw new Error("OPERATIONS_IDEMPOTENCY_KEY_REUSED");
  }
  if (String(existing.state) === "completed" && existing.response_status != null) {
    await audit({ actorId: input.actorId, operation: input.operation }, "staff_operations_mutation_replayed", "success", { recordKey: recordKey.slice(0, 16), responseStatus: Number(existing.response_status) });
    return {
      recordKey,
      replay: {
        status: Number(existing.response_status),
        contentType: String(existing.response_content_type || "application/json"),
        body: Buffer.from(String(existing.response_body_base64 || ""), "base64"),
      },
    };
  }
  await audit({ actorId: input.actorId, operation: input.operation }, "staff_operations_duplicate_in_progress", "blocked", { recordKey: recordKey.slice(0, 16) });
  return { recordKey, inProgress: true };
}

export async function completeOperationsMutation(recordKey: string, status: number, contentType: string, body: Buffer) {
  await ensureSchema();
  const context = await mutationContext(recordKey);
  if (status >= 500) {
    await audit(context, "staff_operations_mutation_upstream_failed", "failed", { recordKey: recordKey.slice(0, 16), responseStatus: status });
    await sql()`DELETE FROM operations_mutation_idempotency WHERE record_key=${recordKey}`;
    return;
  }
  await sql()`UPDATE operations_mutation_idempotency SET state='completed',response_status=${status},response_content_type=${contentType},response_body_base64=${body.toString("base64")},updated_at=NOW() WHERE record_key=${recordKey}`;
  await audit(context, "staff_operations_mutation_completed", status >= 400 ? "rejected" : "success", { recordKey: recordKey.slice(0, 16), responseStatus: status });
}

export async function abandonOperationsMutation(recordKey: string) {
  await ensureSchema();
  const context = await mutationContext(recordKey);
  await audit(context, "staff_operations_mutation_abandoned", "blocked", { recordKey: recordKey.slice(0, 16) });
  await sql()`DELETE FROM operations_mutation_idempotency WHERE record_key=${recordKey}`;
}
