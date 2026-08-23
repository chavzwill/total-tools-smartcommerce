export type CommercialCreditReservationItem = {
  id: string;
  commercialAccountId: string;
  commercialAccountName: string | null;
  customerId: string;
  quoteId: string;
  currency: string;
  amountMinor: number;
  reservationStatus: string;
  state: "active_reservation" | "expired_reservation" | "committed_unreconciled" | "reconciled_commitment" | "released";
  orderId: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  providerReconciled: boolean;
  consumesCredit: boolean;
};

type ApiError = { error?: { code?: string; message?: string } };

export async function getCommercialCreditReconciliation() {
  const response = await fetch("/api/commercial-credit-reconciliation", { credentials: "same-origin", headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => ({})) as ApiError & {
    items?: CommercialCreditReservationItem[];
    summary?: { total: number; consumingCredit: number; active: number; expired: number; committedUnreconciled: number; reconciled: number; released: number; consumingAmountMinor: number };
  };
  if (!response.ok) {
    const error = new Error(payload.error?.message || "Commercial-credit reconciliation could not be loaded.") as Error & { code?: string; status?: number };
    error.code = payload.error?.code;
    error.status = response.status;
    throw error;
  }
  return {
    items: payload.items || [],
    summary: payload.summary || { total: 0, consumingCredit: 0, active: 0, expired: 0, committedUnreconciled: 0, reconciled: 0, released: 0, consumingAmountMinor: 0 },
  };
}
