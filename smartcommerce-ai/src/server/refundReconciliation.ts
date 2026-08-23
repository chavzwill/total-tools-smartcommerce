import { neon } from "@neondatabase/serverless";
import { ensureCommercialAccountingSchema } from "./commercialAccountingLedger.js";
import { ensureReturnSchema } from "./returnRequestStore.js";

let sqlClient: ReturnType<typeof neon> | undefined;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("REFUND_RECONCILIATION_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

export type RefundReconciliationState =
  | "not_applicable"
  | "return_open"
  | "refund_pending"
  | "refund_unmatched"
  | "refund_amount_mismatch"
  | "refund_reference_mismatch"
  | "refund_reconciled";

function moneyNumber(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

function normalizeReference(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export async function getRefundReconciliationForOrder(customerId: string, orderId: string) {
  await Promise.all([ensureCommercialAccountingSchema(), ensureReturnSchema()]);
  const db = sql();
  const [returns, refunds] = await Promise.all([
    db`
      SELECT id, status, requested_resolution, requested_amount_minor, approved_amount_minor,
             refund_reference, updated_at
      FROM return_requests
      WHERE customer_id=${customerId} AND order_id=${orderId}
      ORDER BY created_at DESC
      LIMIT 1
    ` as unknown as Promise<Array<any>>,
    db`
      SELECT id, reference, external_reference, credit_minor, currency, status, source,
             source_coverage, occurred_at
      FROM commercial_account_ledger_entries
      WHERE customer_id=${customerId} AND order_id=${orderId} AND entry_type='refund'
      ORDER BY occurred_at DESC, created_at DESC
    ` as unknown as Promise<Array<any>>,
  ]);

  const request = returns[0] || null;
  if (!request || request.requested_resolution !== "refund") {
    return { state: "not_applicable" as RefundReconciliationState, request: request || null, refunds: [] };
  }

  if (!["refund_pending", "refund_completed", "closed"].includes(String(request.status || ""))) {
    return { state: "return_open" as RefundReconciliationState, request, refunds };
  }
  if (request.status === "refund_pending") {
    return { state: "refund_pending" as RefundReconciliationState, request, refunds };
  }

  const approvedMinor = moneyNumber(request.approved_amount_minor ?? request.requested_amount_minor);
  const totalRefundMinor = refunds.reduce((sum, row) => sum + moneyNumber(row.credit_minor), 0);
  if (!refunds.length) {
    return { state: "refund_unmatched" as RefundReconciliationState, request, refunds, approvedMinor, totalRefundMinor };
  }
  if (approvedMinor > 0 && totalRefundMinor !== approvedMinor) {
    return { state: "refund_amount_mismatch" as RefundReconciliationState, request, refunds, approvedMinor, totalRefundMinor };
  }

  const expectedReference = normalizeReference(request.refund_reference);
  if (expectedReference) {
    const referenceMatched = refunds.some((row) => {
      const candidates = [row.external_reference, row.reference].map(normalizeReference).filter(Boolean);
      return candidates.includes(expectedReference);
    });
    if (!referenceMatched) {
      return { state: "refund_reference_mismatch" as RefundReconciliationState, request, refunds, approvedMinor, totalRefundMinor };
    }
  }

  return { state: "refund_reconciled" as RefundReconciliationState, request, refunds, approvedMinor, totalRefundMinor };
}

export async function listRefundReconciliationExceptions() {
  await Promise.all([ensureCommercialAccountingSchema(), ensureReturnSchema()]);
  const rows = await sql()`
    SELECT rr.id AS return_id, rr.customer_id, rr.order_id, rr.status AS return_status,
           rr.approved_amount_minor, rr.requested_amount_minor, rr.currency, rr.refund_reference,
           rr.updated_at,
           COALESCE(SUM(le.credit_minor),0)::bigint AS ledger_refund_minor,
           COUNT(le.id)::int AS ledger_refund_count,
           BOOL_OR(
             LOWER(COALESCE(le.external_reference,''))=LOWER(COALESCE(rr.refund_reference,'')) OR
             LOWER(COALESCE(le.reference,''))=LOWER(COALESCE(rr.refund_reference,''))
           ) AS reference_matched
    FROM return_requests rr
    LEFT JOIN commercial_account_ledger_entries le
      ON le.customer_id=rr.customer_id AND le.order_id=rr.order_id AND le.entry_type='refund'
    WHERE rr.requested_resolution='refund' AND rr.status IN ('refund_completed','closed')
    GROUP BY rr.id
    ORDER BY rr.updated_at DESC
    LIMIT 250
  ` as unknown as Array<any>;

  return rows.flatMap((row) => {
    const approvedMinor = moneyNumber(row.approved_amount_minor ?? row.requested_amount_minor);
    const ledgerRefundMinor = moneyNumber(row.ledger_refund_minor);
    const hasRefund = Number(row.ledger_refund_count || 0) > 0;
    let state: RefundReconciliationState = "refund_reconciled";
    if (!hasRefund) state = "refund_unmatched";
    else if (approvedMinor > 0 && ledgerRefundMinor !== approvedMinor) state = "refund_amount_mismatch";
    else if (normalizeReference(row.refund_reference) && !row.reference_matched) state = "refund_reference_mismatch";
    if (state === "refund_reconciled") return [];
    return [{
      returnId: row.return_id,
      customerId: row.customer_id,
      orderId: row.order_id,
      returnStatus: row.return_status,
      currency: row.currency || "JMD",
      approvedMinor,
      ledgerRefundMinor,
      refundReference: row.refund_reference || null,
      ledgerRefundCount: Number(row.ledger_refund_count || 0),
      state,
      updatedAt: row.updated_at,
    }];
  });
}
