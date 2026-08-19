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
  await db`CREATE INDEX IF NOT EXISTS commercial_account_ledger_account_date_idx ON commercial_account_ledger_entries(commercial_account_id, occurred_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS commercial_account_ledger_order_idx ON commercial_account_ledger_entries(order_id) WHERE order_id IS NOT NULL`;
  await db`CREATE INDEX IF NOT EXISTS commercial_account_ledger_invoice_idx ON commercial_account_ledger_entries(invoice_id) WHERE invoice_id IS NOT NULL`;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS commercial_account_ledger_source_reference_uidx ON commercial_account_ledger_entries(commercial_account_id, source, external_reference) WHERE external_reference IS NOT NULL`;
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

export async function getCommercialLedgerStatement(input: {
  commercialAccountId: string;
  startAt: string;
  endAt: string;
}) {
  await ensureCommercialAccountingSchema();
  const db = sql();
  const entries = await db`
    SELECT id, entry_type, reference, external_reference, order_id, invoice_id,
           purchase_order_reference, description, currency, debit_minor, credit_minor,
           occurred_at, due_at, status, source, source_coverage, metadata
    FROM commercial_account_ledger_entries
    WHERE commercial_account_id = ${input.commercialAccountId}
      AND occurred_at >= ${input.startAt}
      AND occurred_at < ${input.endAt}
    ORDER BY occurred_at ASC, created_at ASC
  ` as Array<any>;

  const coverageRows = await db`
    SELECT
      COUNT(*)::int AS total_count,
      COUNT(*) FILTER (WHERE source_coverage = 'provider_synced')::int AS provider_synced_count,
      COALESCE(SUM(debit_minor), 0)::bigint AS debit_minor,
      COALESCE(SUM(credit_minor), 0)::bigint AS credit_minor
    FROM commercial_account_ledger_entries
    WHERE commercial_account_id = ${input.commercialAccountId}
      AND occurred_at >= ${input.startAt}
      AND occurred_at < ${input.endAt}
  ` as Array<{ total_count: number; provider_synced_count: number; debit_minor: number | string; credit_minor: number | string }>;
  const summary = coverageRows[0] || { total_count: 0, provider_synced_count: 0, debit_minor: 0, credit_minor: 0 };
  const debitMinor = Number(summary.debit_minor || 0);
  const creditMinor = Number(summary.credit_minor || 0);
  const providerSynced = summary.total_count > 0 && summary.provider_synced_count === summary.total_count;

  return {
    entries,
    summary: {
      totalEntries: Number(summary.total_count || 0),
      debitMinor,
      creditMinor,
      activityNetMinor: debitMinor - creditMinor,
      coverage: providerSynced ? "provider_synced" as const : "smartcommerce_only" as const,
      officialBalanceMinor: providerSynced ? debitMinor - creditMinor : null,
    },
  };
}
