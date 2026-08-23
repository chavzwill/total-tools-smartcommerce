export type RefundReconciliationException = {
  returnId: string;
  customerId: string;
  orderId: string;
  returnStatus: string;
  currency: string;
  approvedMinor: number;
  ledgerRefundMinor: number;
  refundReference: string | null;
  ledgerRefundCount: number;
  state: "refund_unmatched" | "refund_amount_mismatch" | "refund_reference_mismatch";
  updatedAt: string;
};

export type RefundReconciliationResponse = {
  exceptions: RefundReconciliationException[];
  summary: { total: number; unmatched: number; amountMismatch: number; referenceMismatch: number };
  staff: { employeeId: string; username: string; role?: string };
};

export async function getRefundReconciliation(): Promise<RefundReconciliationResponse> {
  const response = await fetch("/api/refund-reconciliation", { credentials: "same-origin", headers: { Accept: "application/json" } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error?.message || "Refund reconciliation could not be loaded.") as Error & { status?: number; code?: string };
    error.status = response.status;
    error.code = body?.error?.code;
    throw error;
  }
  return body as RefundReconciliationResponse;
}
