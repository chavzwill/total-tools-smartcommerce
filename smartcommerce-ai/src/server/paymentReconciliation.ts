import { neon } from "@neondatabase/serverless";
import { ensurePaymentSettlementSchema } from "./paymentSettlement.js";

let sqlClient: ReturnType<typeof neon> | undefined;
function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("PAYMENT_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

function threshold(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

export async function listPaymentReconciliation(limit = 250) {
  await ensurePaymentSettlementSchema();
  const warningMinutes = threshold("SMARTCOMMERCE_PAYMENT_RECONCILIATION_WARNING_MINUTES", 15);
  const staleMinutes = Math.max(warningMinutes + 1, threshold("SMARTCOMMERCE_PAYMENT_RECONCILIATION_STALE_MINUTES", 60));
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit || 250)));
  const rows = await sql()`
    SELECT id, customer_id, quote_id, payment_method, provider, currency, amount_minor,
           status, provider_payment_id, provider_reference, failure_code, confirmation_source,
           confirmed_at, created_at, updated_at,
           GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW()-updated_at))/60))::int AS age_minutes
    FROM payment_attempts
    ORDER BY
      CASE
        WHEN status='provider_pending' AND updated_at <= NOW()-(${staleMinutes}::int * INTERVAL '1 minute') THEN 0
        WHEN status='provider_pending' AND updated_at <= NOW()-(${warningMinutes}::int * INTERVAL '1 minute') THEN 1
        WHEN status='prepared' THEN 2
        WHEN status='provider_pending' THEN 3
        ELSE 4
      END,
      updated_at DESC
    LIMIT ${safeLimit}
  ` as unknown as Array<any>;

  const items = rows.map((row) => {
    const ageMinutes = Number(row.age_minutes || 0);
    let attention: "normal" | "watch" | "stale" = "normal";
    if (row.status === "provider_pending" && ageMinutes >= staleMinutes) attention = "stale";
    else if (row.status === "provider_pending" && ageMinutes >= warningMinutes) attention = "watch";
    return {
      id: String(row.id), customerId: String(row.customer_id), quoteId: String(row.quote_id),
      paymentMethod: String(row.payment_method), provider: row.provider ? String(row.provider) : null,
      currency: String(row.currency || "JMD").toUpperCase(), amountMinor: Number(row.amount_minor || 0),
      status: String(row.status), providerPaymentId: row.provider_payment_id ? String(row.provider_payment_id) : null,
      providerReference: row.provider_reference ? String(row.provider_reference) : null,
      failureCode: row.failure_code ? String(row.failure_code) : null,
      confirmationSource: row.confirmation_source ? String(row.confirmation_source) : null,
      confirmedAt: row.confirmed_at || null, createdAt: row.created_at, updatedAt: row.updated_at,
      ageMinutes, attention,
      paid: row.status === "confirmed" && Boolean(row.confirmation_source),
    };
  });
  return {
    items,
    thresholds: { warningMinutes, staleMinutes },
    summary: {
      total: items.length,
      prepared: items.filter((i) => i.status === "prepared").length,
      pending: items.filter((i) => i.status === "provider_pending").length,
      confirmed: items.filter((i) => i.status === "confirmed").length,
      failed: items.filter((i) => i.status === "failed").length,
      stale: items.filter((i) => i.attention === "stale").length,
      staleAmountMinor: items.filter((i) => i.attention === "stale").reduce((sum,i)=>sum+i.amountMinor,0),
    },
  };
}
