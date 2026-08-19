import { neon } from "@neondatabase/serverless";
import { ensureCommercialAccountingSchema } from "./commercialAccountingLedger.js";

let sqlClient: ReturnType<typeof neon> | undefined;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("COMMERCIAL_ACCOUNTING_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

export async function getCommercialReceivablesSummary(commercialAccountId: string) {
  await ensureCommercialAccountingSchema();
  const rows = await sql()`
    SELECT
      id, reference, invoice_id, external_reference, purchase_order_reference,
      description, currency, occurred_at, due_at, status,
      CASE
        WHEN (metadata->>'outstandingMinor') ~ '^[0-9]+$'
          THEN (metadata->>'outstandingMinor')::bigint
        ELSE NULL
      END AS outstanding_minor
    FROM commercial_account_ledger_entries
    WHERE commercial_account_id = ${commercialAccountId}
      AND entry_type = 'invoice'
      AND source_coverage = 'provider_synced'
      AND status NOT IN ('void', 'cancelled', 'reversed')
      AND (metadata->>'outstandingMinor') ~ '^[0-9]+$'
      AND (metadata->>'outstandingMinor')::bigint > 0
    ORDER BY due_at ASC NULLS LAST, occurred_at ASC
  ` as unknown as Array<any>;

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const buckets = { currentMinor: 0, overdue1To30Minor: 0, overdue31To60Minor: 0, overdue61To90Minor: 0, overdue90PlusMinor: 0 };
  let totalOutstandingMinor = 0;

  const invoices = rows.map((row) => {
    const outstandingMinor = Number(row.outstanding_minor || 0);
    totalOutstandingMinor += outstandingMinor;
    const dueMs = row.due_at ? new Date(row.due_at).getTime() : Number.NaN;
    const daysOverdue = Number.isFinite(dueMs) ? Math.max(0, Math.floor((now - dueMs) / day)) : 0;
    if (!Number.isFinite(dueMs) || dueMs >= now) buckets.currentMinor += outstandingMinor;
    else if (daysOverdue <= 30) buckets.overdue1To30Minor += outstandingMinor;
    else if (daysOverdue <= 60) buckets.overdue31To60Minor += outstandingMinor;
    else if (daysOverdue <= 90) buckets.overdue61To90Minor += outstandingMinor;
    else buckets.overdue90PlusMinor += outstandingMinor;

    return {
      id: row.id,
      reference: row.reference,
      invoiceId: row.invoice_id,
      externalReference: row.external_reference,
      purchaseOrderReference: row.purchase_order_reference,
      description: row.description,
      currency: row.currency,
      occurredAt: row.occurred_at,
      dueAt: row.due_at,
      status: row.status,
      outstandingMinor,
      daysOverdue,
    };
  });

  return {
    totalOutstandingMinor,
    ...buckets,
    invoices,
    authoritative: true,
    basis: "provider_invoice_outstanding" as const,
  };
}
