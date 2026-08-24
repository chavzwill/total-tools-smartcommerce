import { randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { ensureOperationalOrderHandoffSchema } from "./operationalOrderHandoff.js";

let sqlClient: ReturnType<typeof neon> | undefined;
function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("OPERATIONAL_ORDER_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

const DEFAULT_LEASE_SECONDS = 90;
const DEFAULT_MAX_ATTEMPTS = 8;
const MAX_BATCH = 25;

export type OperationalOutboxDestination = "pos_order_write" | "inventory_commitment" | "fulfilment_activation";
export type OperationalOutboxJob = {
  id: string;
  order_id: string;
  destination: OperationalOutboxDestination;
  status: "pending" | "processing" | "acknowledged" | "failed";
  attempts: number;
  lease_token?: string | null;
  lease_until?: string | null;
  last_error_code?: string | null;
  next_attempt_at: string;
  order_snapshot?: unknown;
  tracking_reference?: string;
  subject_kind?: "customer" | "guest";
  fulfilment_mode?: "pickup" | "delivery";
};

export type OperationalOutboxProcessorResult =
  | { outcome: "acknowledged"; externalReference: string }
  | { outcome: "retry"; errorCode: string; retryAfterSeconds?: number }
  | { outcome: "failed"; errorCode: string };

export async function ensureOperationalOutboxWorkerSchema() {
  await ensureOperationalOrderHandoffSchema();
  await sql()`ALTER TABLE operational_order_outbox ADD COLUMN IF NOT EXISTS lease_token TEXT`;
  await sql()`ALTER TABLE operational_order_outbox ADD COLUMN IF NOT EXISTS lease_until TIMESTAMPTZ`;
  await sql()`ALTER TABLE operational_order_outbox ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ`;
  await sql()`ALTER TABLE operational_order_outbox ADD COLUMN IF NOT EXISTS external_reference TEXT`;
  await sql()`ALTER TABLE operational_order_outbox ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ`;
  await sql()`CREATE INDEX IF NOT EXISTS operational_outbox_claim_idx ON operational_order_outbox(status, next_attempt_at, lease_until)`;
}

function clampBatch(limit?: number) {
  return Math.max(1, Math.min(MAX_BATCH, Math.trunc(limit || 10)));
}

function clampLease(seconds?: number) {
  return Math.max(30, Math.min(600, Math.trunc(seconds || DEFAULT_LEASE_SECONDS)));
}

function retryDelaySeconds(attempts: number) {
  const exponent = Math.max(0, Math.min(8, attempts - 1));
  return Math.min(3600, 15 * 2 ** exponent);
}

export async function claimOperationalOutboxJobs(input: { limit?: number; leaseSeconds?: number } = {}) {
  await ensureOperationalOutboxWorkerSchema();
  const limit = clampBatch(input.limit);
  const leaseSeconds = clampLease(input.leaseSeconds);
  const leaseToken = `lease_${randomBytes(18).toString("hex")}`;

  const rows = await sql()`
    WITH claimable AS (
      SELECT id
      FROM operational_order_outbox
      WHERE (
        (status='pending' AND next_attempt_at <= NOW())
        OR (status='processing' AND lease_until IS NOT NULL AND lease_until <= NOW())
      )
      ORDER BY next_attempt_at ASC, created_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE operational_order_outbox q
    SET status='processing',
        attempts=q.attempts + 1,
        lease_token=${leaseToken},
        lease_until=NOW() + (${leaseSeconds} * INTERVAL '1 second'),
        claimed_at=NOW(),
        updated_at=NOW()
    FROM claimable c
    WHERE q.id=c.id
    RETURNING q.*
  ` as unknown as Array<any>;

  if (!rows.length) return { leaseToken, jobs: [] as OperationalOutboxJob[] };
  const ids = rows.map((row) => String(row.id));
  const enriched = await sql()`
    SELECT q.*, o.snapshot AS order_snapshot, o.tracking_reference, o.subject_kind, o.fulfilment_mode
    FROM operational_order_outbox q
    JOIN operational_orders o ON o.id=q.order_id
    WHERE q.id = ANY(${ids}::text[])
      AND q.lease_token=${leaseToken}
    ORDER BY q.claimed_at ASC, q.id ASC
  ` as unknown as OperationalOutboxJob[];
  return { leaseToken, jobs: enriched };
}

export async function acknowledgeOperationalOutboxJob(input: { jobId: string; leaseToken: string; externalReference: string }) {
  await ensureOperationalOutboxWorkerSchema();
  const externalReference = String(input.externalReference || "").trim();
  if (!externalReference) throw new Error("OPERATIONAL_OUTBOX_ACK_REFERENCE_REQUIRED");
  const rows = await sql()`
    UPDATE operational_order_outbox
    SET status='acknowledged', external_reference=${externalReference}, acknowledged_at=NOW(),
        lease_token=NULL, lease_until=NULL, last_error_code=NULL, updated_at=NOW()
    WHERE id=${input.jobId}
      AND status='processing'
      AND lease_token=${input.leaseToken}
      AND lease_until > NOW()
    RETURNING order_id, destination
  ` as unknown as Array<{ order_id: string; destination: OperationalOutboxDestination }>;
  if (!rows[0]) return false;

  const job = rows[0];
  if (job.destination === "pos_order_write") {
    await sql()`
      UPDATE operational_orders
      SET pos_handoff_status='acknowledged', pos_order_reference=${externalReference}, updated_at=NOW()
      WHERE id=${job.order_id}
    `;
  } else if (job.destination === "inventory_commitment") {
    await sql()`
      UPDATE operational_order_inventory_commitments
      SET status='provider_acknowledged', updated_at=NOW()
      WHERE order_id=${job.order_id} AND status='committed_internal'
    `;
    await sql()`
      UPDATE operational_orders
      SET inventory_commitment_status='provider_acknowledged', updated_at=NOW()
      WHERE id=${job.order_id}
    `;
  } else if (job.destination === "fulfilment_activation") {
    await sql()`
      UPDATE operational_orders
      SET fulfilment_status='awaiting_operations', updated_at=NOW()
      WHERE id=${job.order_id}
    `;
  }

  await sql()`
    INSERT INTO operational_order_events(id, order_id, event_type, event_key, payload)
    VALUES (
      ${`evt_${randomBytes(16).toString("hex")}`},
      ${job.order_id},
      'handoff_acknowledged',
      ${`outbox:${input.jobId}:ack`},
      ${JSON.stringify({ destination: job.destination, externalReference })}::jsonb
    )
    ON CONFLICT (order_id, event_key) DO NOTHING
  `;
  return true;
}

export async function retryOperationalOutboxJob(input: { jobId: string; leaseToken: string; errorCode: string; retryAfterSeconds?: number; maxAttempts?: number }) {
  await ensureOperationalOutboxWorkerSchema();
  const maxAttempts = Math.max(1, Math.min(30, Math.trunc(input.maxAttempts || DEFAULT_MAX_ATTEMPTS)));
  const current = await sql()`
    SELECT attempts
    FROM operational_order_outbox
    WHERE id=${input.jobId} AND status='processing' AND lease_token=${input.leaseToken}
    LIMIT 1
  ` as unknown as Array<{ attempts: number }>;
  if (!current[0]) return { updated: false, terminal: false };

  const attempts = Number(current[0].attempts || 0);
  const errorCode = String(input.errorCode || "handoff_retryable_failure").slice(0, 120);
  if (attempts >= maxAttempts) {
    const rows = await sql()`
      UPDATE operational_order_outbox
      SET status='failed', last_error_code=${errorCode}, failed_at=NOW(), lease_token=NULL, lease_until=NULL, updated_at=NOW()
      WHERE id=${input.jobId} AND status='processing' AND lease_token=${input.leaseToken}
      RETURNING order_id, destination
    ` as unknown as Array<any>;
    if (rows[0]?.destination === "pos_order_write") {
      await sql()`UPDATE operational_orders SET pos_handoff_status='failed', updated_at=NOW() WHERE id=${rows[0].order_id}`;
    }
    return { updated: Boolean(rows[0]), terminal: Boolean(rows[0]) };
  }

  const delay = Math.max(5, Math.min(3600, Math.trunc(input.retryAfterSeconds || retryDelaySeconds(attempts))));
  const rows = await sql()`
    UPDATE operational_order_outbox
    SET status='pending', last_error_code=${errorCode}, next_attempt_at=NOW() + (${delay} * INTERVAL '1 second'),
        lease_token=NULL, lease_until=NULL, updated_at=NOW()
    WHERE id=${input.jobId} AND status='processing' AND lease_token=${input.leaseToken}
    RETURNING id
  ` as unknown as Array<any>;
  return { updated: Boolean(rows[0]), terminal: false };
}

export async function failOperationalOutboxJob(input: { jobId: string; leaseToken: string; errorCode: string }) {
  await ensureOperationalOutboxWorkerSchema();
  const errorCode = String(input.errorCode || "handoff_terminal_failure").slice(0, 120);
  const rows = await sql()`
    UPDATE operational_order_outbox
    SET status='failed', last_error_code=${errorCode}, failed_at=NOW(), lease_token=NULL, lease_until=NULL, updated_at=NOW()
    WHERE id=${input.jobId} AND status='processing' AND lease_token=${input.leaseToken}
    RETURNING order_id, destination
  ` as unknown as Array<any>;
  if (rows[0]?.destination === "pos_order_write") {
    await sql()`UPDATE operational_orders SET pos_handoff_status='failed', updated_at=NOW() WHERE id=${rows[0].order_id}`;
  }
  return Boolean(rows[0]);
}

export async function processOperationalOutboxBatch(
  processor: (job: OperationalOutboxJob) => Promise<OperationalOutboxProcessorResult>,
  input: { limit?: number; leaseSeconds?: number; maxAttempts?: number } = {},
) {
  const claimed = await claimOperationalOutboxJobs(input);
  const results: Array<{ jobId: string; outcome: string }> = [];
  for (const job of claimed.jobs) {
    try {
      const result = await processor(job);
      if (result.outcome === "acknowledged") {
        const updated = await acknowledgeOperationalOutboxJob({ jobId: job.id, leaseToken: claimed.leaseToken, externalReference: result.externalReference });
        results.push({ jobId: job.id, outcome: updated ? "acknowledged" : "lease_lost" });
      } else if (result.outcome === "retry") {
        const updated = await retryOperationalOutboxJob({ jobId: job.id, leaseToken: claimed.leaseToken, errorCode: result.errorCode, retryAfterSeconds: result.retryAfterSeconds, maxAttempts: input.maxAttempts });
        results.push({ jobId: job.id, outcome: updated.terminal ? "failed" : updated.updated ? "retry_scheduled" : "lease_lost" });
      } else {
        const updated = await failOperationalOutboxJob({ jobId: job.id, leaseToken: claimed.leaseToken, errorCode: result.errorCode });
        results.push({ jobId: job.id, outcome: updated ? "failed" : "lease_lost" });
      }
    } catch {
      const updated = await retryOperationalOutboxJob({ jobId: job.id, leaseToken: claimed.leaseToken, errorCode: "worker_unhandled_error", maxAttempts: input.maxAttempts });
      results.push({ jobId: job.id, outcome: updated.terminal ? "failed" : updated.updated ? "retry_scheduled" : "lease_lost" });
    }
  }
  return { claimed: claimed.jobs.length, results };
}
