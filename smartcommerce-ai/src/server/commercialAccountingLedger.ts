import { neon } from "@neondatabase/serverless";
import { randomBytes } from "node:crypto";

let sqlClient: ReturnType<typeof neon> | undefined;
let schemaReady = false;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("COMMERCIAL_ACCOUNTING_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

export type CommercialLedgerEntryType =
  | "order_charge"
  | "invoice"
  | "payment"
  | "credit_note"
  | "refund"
  | "adjustment_debit"
  | "adjustment_credit"
  | "opening_balance";

export type CommercialLedgerEntryInput = {
  commercialAccountId: string;
  customerId?: string | null;
  entryType: CommercialLedgerEntryType;
  reference: string;
  externalReference?: string | null;
  orderId?: string | null;
  invoiceId?: string | null;
  purchaseOrderReference?: string | null;
  description: string;
  currency: string;
  debitMinor?: number;
  creditMinor?: number;
  occurredAt?: string;
  dueAt?: string | null;
  status?: string;
  source: "smartcommerce" | "provider" | "accounting_sync" | "manual_reviewed";
  sourceCoverage?: "smartcommerce_only" | "provider_synced";
  metadata?: Record<string, string | number | boolean | null>;
};

export type CommercialReconciliationCheckpointInput = {
  commercialAccountId: string;
  providerReference: string;
  currency: string;
  coverageStart: string;
  coverageEnd: string;
  openingBalanceMinor: number;
  closingBalanceMinor: number;
  reconciledAt?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export async function ensureCommercialAccountingSchema() {
  if (schemaReady) return;
  const db = sql();
  await db`
    CREATE TABLE IF NOT EXISTS commercial_account_ledger_entries (
      id TEXT PRIMARY KEY,
      commercial_account_id TEXT NOT NULL,
      customer_id TEXT,
      entry_type TEXT NOT NULL,
      reference TEXT NOT NULL,
      external_reference TEXT,
      order_id TEXT,
      invoice_id TEXT,
      purchase_order_reference TEXT,
      description TEXT NOT NULL,
      currency TEXT NOT NULL,
      debit_minor BIGINT NOT NULL DEFAULT 0,
      credit_minor BIGINT NOT NULL DEFAULT 0,
      occurred_at TIMESTAMPTZ NOT NULL,
      due_at TIMESTAMPTZ,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      source_coverage TEXT NOT NULL DEFAULT 'smartcommerce_only',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT commercial_account_ledger_nonnegative CHECK (debit_minor >= 0 AND credit_minor >= 0),
      CONSTRAINT commercial_account_ledger_single_direction CHECK (NOT (debit_minor > 0 AND credit_minor > 0))
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS commercial_account_reconciliation_checkpoints (
      id TEXT PRIMARY KEY,
      commercial_account_id TEXT NOT NULL,
      provider_reference TEXT NOT NULL,
      currency TEXT NOT NULL,
      coverage_start TIMESTAMPTZ NOT NULL,
      coverage_end TIMESTAMPTZ NOT NULL,
      opening_balance_minor BIGINT NOT NULL,
      closing_balance_minor BIGINT NOT NULL,
      reconciled_at TIMESTAMPTZ NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT commercial_account_reconciliation_period CHECK (coverage_end > coverage_start)
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS commercial_account_ledger_account_date_idx ON commercial_account_ledger_entries(commercial_account_id, occurred_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS commercial_account_ledger_order_idx ON commercial_account_ledger_entries(order_id) WHERE order_id IS NOT NULL`;
  await db`CREATE INDEX IF NOT EXISTS commercial_account_ledger_invoice_idx ON commercial_account_ledger_entries(invoice_id) WHERE invoice_id IS NOT NULL`;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS commercial_account_ledger_source_reference_uidx ON commercial_account_ledger_entries(commercial_account_id, source, external_reference) WHERE external_reference IS NOT NULL`;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS commercial_account_reconciliation_reference_uidx ON commercial_account_reconciliation_checkpoints(commercial_account_id, provider_reference)`;
  await db`CREATE INDEX IF NOT EXISTS commercial_account_reconciliation_coverage_idx ON commercial_account_reconciliation_checkpoints(commercial_account_id, coverage_start, coverage_end)`;
  schemaReady = true;
}

export async function recordCommercialLedgerEntry(input: CommercialLedgerEntryInput) {
  await ensureCommercialAccountingSchema();
  const debitMinor = Math.max(0, Math.trunc(Number(input.debitMinor || 0)));
  const creditMinor = Math.max(0, Math.trunc(Number(input.creditMinor || 0)));
  if (debitMinor > 0 && creditMinor > 0) throw new Error("LEDGER_ENTRY_DIRECTION_INVALID");
  const id = `cle_${randomBytes(16).toString("hex")}`;
  const occurredAt = input.occurredAt || new Date().toISOString();
  const status = input.status || "posted";
  const currency = String(input.currency || "JMD").toUpperCase();
  const metadata = input.metadata || {};
  const rows = await sql()`
    INSERT INTO commercial_account_ledger_entries (
      id, commercial_account_id, customer_id, entry_type, reference, external_reference,
      order_id, invoice_id, purchase_order_reference, description, currency,
      debit_minor, credit_minor, occurred_at, due_at, status, source, source_coverage, metadata
    ) VALUES (
      ${id}, ${input.commercialAccountId}, ${input.customerId || null}, ${input.entryType},
      ${input.reference}, ${input.externalReference || null}, ${input.orderId || null},
      ${input.invoiceId || null}, ${input.purchaseOrderReference || null}, ${input.description},
      ${currency}, ${debitMinor}, ${creditMinor}, ${occurredAt}, ${input.dueAt || null},
      ${status}, ${input.source}, ${input.sourceCoverage || "smartcommerce_only"}, ${JSON.stringify(metadata)}::jsonb
    )
    ON CONFLICT (commercial_account_id, source, external_reference)
      WHERE external_reference IS NOT NULL
    DO UPDATE SET
      status = EXCLUDED.status,
      due_at = COALESCE(EXCLUDED.due_at, commercial_account_ledger_entries.due_at),
      description = EXCLUDED.description,
      metadata = commercial_account_ledger_entries.metadata || EXCLUDED.metadata,
      updated_at = NOW()
    RETURNING *
  ` as Array<Record<string, unknown>>;
  return rows[0];
}

export async function recordCommercialReconciliationCheckpoint(input: CommercialReconciliationCheckpointInput) {
  await ensureCommercialAccountingSchema();
  const coverageStart = new Date(input.coverageStart);
  const coverageEnd = new Date(input.coverageEnd);
  if (!Number.isFinite(coverageStart.getTime()) || !Number.isFinite(coverageEnd.getTime()) || coverageEnd <= coverageStart) {
    throw new Error("RECONCILIATION_COVERAGE_INVALID");
  }
  if (!Number.isSafeInteger(input.openingBalanceMinor) || !Number.isSafeInteger(input.closingBalanceMinor)) {
    throw new Error("RECONCILIATION_BALANCE_INVALID");
  }
  const id = `crc_${randomBytes(16).toString("hex")}`;
  const rows = await sql()`
    INSERT INTO commercial_account_reconciliation_checkpoints (
      id, commercial_account_id, provider_reference, currency, coverage_start, coverage_end,
      opening_balance_minor, closing_balance_minor, reconciled_at, metadata
    ) VALUES (
      ${id}, ${input.commercialAccountId.trim()}, ${input.providerReference.trim()},
      ${input.currency.trim().toUpperCase()}, ${coverageStart.toISOString()}, ${coverageEnd.toISOString()},
      ${input.openingBalanceMinor}, ${input.closingBalanceMinor},
      ${input.reconciledAt || new Date().toISOString()}, ${JSON.stringify(input.metadata || {})}::jsonb
    )
    ON CONFLICT (commercial_account_id, provider_reference)
    DO UPDATE SET
      currency = EXCLUDED.currency,
      coverage_start = EXCLUDED.coverage_start,
      coverage_end = EXCLUDED.coverage_end,
      opening_balance_minor = EXCLUDED.opening_balance_minor,
      closing_balance_minor = EXCLUDED.closing_balance_minor,
      reconciled_at = EXCLUDED.reconciled_at,
      metadata = commercial_account_reconciliation_checkpoints.metadata || EXCLUDED.metadata,
      updated_at = NOW()
    RETURNING *
  ` as Array<Record<string, unknown>>;
  return rows[0];
}

export async function getCommercialLedgerStatement(input: {
  commercialAccountId: string;
  startAt: string;
  endAt: string;
}) {
  await ensureCommercialAccountingSchema();
  const db = sql();
  const [entries, coverageRows, checkpointRows] = await Promise.all([
    db`
      SELECT id, entry_type, reference, external_reference, order_id, invoice_id,
             purchase_order_reference, description, currency, debit_minor, credit_minor,
             occurred_at, due_at, status, source, source_coverage, metadata
      FROM commercial_account_ledger_entries
      WHERE commercial_account_id = ${input.commercialAccountId}
        AND occurred_at >= ${input.startAt}
        AND occurred_at < ${input.endAt}
      ORDER BY occurred_at ASC, created_at ASC
    ` as unknown as Promise<Array<any>>,
    db`
      SELECT
        COUNT(*)::int AS total_count,
        COUNT(*) FILTER (WHERE source_coverage = 'provider_synced')::int AS provider_synced_count,
        COALESCE(SUM(debit_minor), 0)::bigint AS debit_minor,
        COALESCE(SUM(credit_minor), 0)::bigint AS credit_minor
      FROM commercial_account_ledger_entries
      WHERE commercial_account_id = ${input.commercialAccountId}
        AND occurred_at >= ${input.startAt}
        AND occurred_at < ${input.endAt}
    ` as unknown as Promise<Array<{ total_count: number; provider_synced_count: number; debit_minor: number | string; credit_minor: number | string }>>,
    db`
      SELECT provider_reference, currency, coverage_start, coverage_end,
             opening_balance_minor, closing_balance_minor, reconciled_at
      FROM commercial_account_reconciliation_checkpoints
      WHERE commercial_account_id = ${input.commercialAccountId}
        AND coverage_start <= ${input.startAt}
        AND coverage_end >= ${input.endAt}
      ORDER BY coverage_end ASC, reconciled_at DESC
      LIMIT 1
    ` as unknown as Promise<Array<any>>,
  ]);

  const summary = coverageRows[0] || { total_count: 0, provider_synced_count: 0, debit_minor: 0, credit_minor: 0 };
  const debitMinor = Number(summary.debit_minor || 0);
  const creditMinor = Number(summary.credit_minor || 0);
  const checkpoint = checkpointRows[0] || null;

  return {
    entries,
    reconciliation: checkpoint ? {
      providerReference: checkpoint.provider_reference,
      currency: checkpoint.currency,
      coverageStart: checkpoint.coverage_start,
      coverageEnd: checkpoint.coverage_end,
      openingBalanceMinor: Number(checkpoint.opening_balance_minor || 0),
      closingBalanceMinor: Number(checkpoint.closing_balance_minor || 0),
      reconciledAt: checkpoint.reconciled_at,
    } : null,
    summary: {
      totalEntries: Number(summary.total_count || 0),
      providerSyncedEntries: Number(summary.provider_synced_count || 0),
      debitMinor,
      creditMinor,
      activityNetMinor: debitMinor - creditMinor,
      coverage: checkpoint ? "provider_reconciled" as const : "smartcommerce_only" as const,
      officialOpeningBalanceMinor: checkpoint ? Number(checkpoint.opening_balance_minor || 0) : null,
      officialBalanceMinor: checkpoint ? Number(checkpoint.closing_balance_minor || 0) : null,
      officialCurrency: checkpoint?.currency || null,
    },
  };
}
