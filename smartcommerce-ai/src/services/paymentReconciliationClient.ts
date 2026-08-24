export type PaymentReconciliationItem = {
  id: string;
  customerId: string;
  quoteId: string;
  paymentMethod: string;
  provider: string | null;
  currency: string;
  amountMinor: number;
  status: "prepared" | "provider_pending" | "confirmed" | "failed" | "cancelled" | string;
  providerPaymentId: string | null;
  providerReference: string | null;
  failureCode: string | null;
  confirmationSource: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  ageMinutes: number;
  attention: "normal" | "watch" | "stale";
  paid: boolean;
};

export type PaymentProviderReadiness = {
  currency: string;
  providers: Array<{
    key: "primary_acquirer" | "paypal" | "store_pos";
    selectedProvider: string | null;
    adapterImplemented: boolean;
    merchantConfigured: boolean;
    currencySupported: boolean | null;
    executable: boolean;
    methods: Array<{ id: string; enabled: boolean }>;
  }>;
  policy: {
    capabilityMeansExecutable: boolean;
    secretsExposed: boolean;
    browserRedirectIsProofOfPayment: boolean;
  };
};

type ApiError = { error?: { code?: string; message?: string } };

export async function getPaymentReconciliation() {
  const response = await fetch("/api/payment-reconciliation", {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  const payload = await response.json().catch(() => ({})) as ApiError & {
    items?: PaymentReconciliationItem[];
    thresholds?: { warningMinutes: number; staleMinutes: number };
    summary?: { total: number; prepared: number; pending: number; confirmed: number; failed: number; stale: number; staleAmountMinor: number };
    providerReadiness?: PaymentProviderReadiness;
  };
  if (!response.ok) {
    const error = new Error(payload.error?.message || "Payment reconciliation could not be loaded.") as Error & { code?: string; status?: number };
    error.code = payload.error?.code;
    error.status = response.status;
    throw error;
  }
  return {
    items: payload.items || [],
    thresholds: payload.thresholds || { warningMinutes: 15, staleMinutes: 60 },
    summary: payload.summary || { total: 0, prepared: 0, pending: 0, confirmed: 0, failed: 0, stale: 0, staleAmountMinor: 0 },
    providerReadiness: payload.providerReadiness || null,
  };
}
