import { neon } from "@neondatabase/serverless";
import { ensureCommercialCreditReservationSchema } from "./commercialCreditReservations.js";

let sqlClient: ReturnType<typeof neon> | undefined;
function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("COMMERCIAL_CREDIT_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

function thresholdMinutes(name: string, fallback: number) {
  const value = Number(process.env[name] || fallback);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

const warningMinutes = thresholdMinutes("SMARTCOMMERCE_CREDIT_RECONCILIATION_WARNING_MINUTES", 15);
const staleMinutes = Math.max(warningMinutes + 1, thresholdMinutes("SMARTCOMMERCE_CREDIT_RECONCILIATION_STALE_MINUTES", 60));

export type CommercialCreditReservationState =
  | "active_reservation"
  | "expired_reservation"
  | "committed_syncing"
  | "committed_watch"
  | "committed_stale"
  | "reconciled_commitment"
  | "released";

export async function listCommercialCreditReservationReconciliation(limit = 200) {
  await ensureCommercialCreditReservationSchema();
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit || 200)));
  const rows = await sql()`
    SELECT
      r.id, r.commercial_account_id, r.customer_id, r.quote_id, r.currency,
      r.amount_minor, r.status, r.order_id, r.expires_at, r.created_at, r.updated_at,
      a.display_name AS commercial_account_name,
      EXISTS (
        SELECT 1 FROM commercial_account_ledger_entries l
        WHERE l.commercial_account_id=r.commercial_account_id
          AND l.source_coverage='provider_synced'
          AND r.order_id IS NOT NULL
          AND (l.order_id=r.order_id OR l.external_reference=r.order_id OR l.reference=r.order_id)
      ) AS provider_reconciled
    FROM commercial_credit_reservations r
    LEFT JOIN commercial_accounts a ON a.id=r.commercial_account_id
    ORDER BY
      CASE
        WHEN r.status='committed' AND NOT EXISTS (
          SELECT 1 FROM commercial_account_ledger_entries l
          WHERE l.commercial_account_id=r.commercial_account_id
            AND l.source_coverage='provider_synced'
            AND r.order_id IS NOT NULL
            AND (l.order_id=r.order_id OR l.external_reference=r.order_id OR l.reference=r.order_id)
        ) THEN 0
        WHEN r.status='reserved' AND r.expires_at <= NOW() THEN 1
        WHEN r.status='reserved' THEN 2
        ELSE 3
      END,
      r.updated_at ASC
    LIMIT ${safeLimit}
  ` as unknown as Array<any>;

  const now = Date.now();
  const items = rows.map((row) => {
    const providerReconciled = Boolean(row.provider_reconciled);
    const updatedAtMs = new Date(row.updated_at).getTime();
    const ageMinutes = Math.max(0, Math.floor((now - updatedAtMs) / 60_000));
    let state: CommercialCreditReservationState;
    if (row.status === "released") state = "released";
    else if (row.status === "reserved" && row.expires_at && new Date(row.expires_at).getTime() <= now) state = "expired_reservation";
    else if (row.status === "reserved") state = "active_reservation";
    else if (providerReconciled) state = "reconciled_commitment";
    else if (ageMinutes >= staleMinutes) state = "committed_stale";
    else if (ageMinutes >= warningMinutes) state = "committed_watch";
    else state = "committed_syncing";

    const consumesCredit = state === "active_reservation" || state === "committed_syncing" || state === "committed_watch" || state === "committed_stale";
    const needsAttention = state === "committed_watch" || state === "committed_stale";
    return {
      id: String(row.id),
      commercialAccountId: String(row.commercial_account_id),
      commercialAccountName: row.commercial_account_name ? String(row.commercial_account_name) : null,
      customerId: String(row.customer_id),
      quoteId: String(row.quote_id),
      currency: String(row.currency || "JMD").toUpperCase(),
      amountMinor: Number(row.amount_minor || 0),
      reservationStatus: String(row.status),
      state,
      orderId: row.order_id ? String(row.order_id) : null,
      expiresAt: row.expires_at || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      providerReconciled,
      consumesCredit,
      needsAttention,
      ageMinutes,
    };
  });

  return {
    items,
    thresholds: { warningMinutes, staleMinutes },
    summary: {
      total: items.length,
      consumingCredit: items.filter((item) => item.consumesCredit).length,
      active: items.filter((item) => item.state === "active_reservation").length,
      expired: items.filter((item) => item.state === "expired_reservation").length,
      syncing: items.filter((item) => item.state === "committed_syncing").length,
      watch: items.filter((item) => item.state === "committed_watch").length,
      stale: items.filter((item) => item.state === "committed_stale").length,
      committedUnreconciled: items.filter((item) => ["committed_syncing", "committed_watch", "committed_stale"].includes(item.state)).length,
      needsAttention: items.filter((item) => item.needsAttention).length,
      reconciled: items.filter((item) => item.state === "reconciled_commitment").length,
      released: items.filter((item) => item.state === "released").length,
      consumingAmountMinor: items.filter((item) => item.consumesCredit).reduce((sum, item) => sum + item.amountMinor, 0),
      staleAmountMinor: items.filter((item) => item.state === "committed_stale").reduce((sum, item) => sum + item.amountMinor, 0),
    },
  };
}
