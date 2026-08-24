import type { PaymentMethodId } from "../payments/paymentMethods";

export type PaymentAttempt = {
  id: string;
  quoteId: string;
  paymentMethod: PaymentMethodId;
  provider: string | null;
  currency: string;
  amountMinor: number;
  status: "prepared" | "provider_pending" | "confirmed" | "failed" | "cancelled";
};

export type PaymentAttemptResponse = {
  attempt: PaymentAttempt;
  launch?: {
    ready: boolean;
    reason?: string;
    url?: string;
  };
  policy?: {
    browserRedirectIsProofOfPayment?: boolean;
    paidRequiresVerifiedProviderEvidence?: boolean;
    confirmationSources?: string[];
  };
};

type ErrorPayload = { error?: { code?: string; message?: string } };

export async function prepareStandardPaymentAttempt(input: { quoteId: string; paymentMethod: PaymentMethodId }) {
  const response = await fetch("/api/payment-attempt", {
    method: "POST",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => ({})) as PaymentAttemptResponse & ErrorPayload;
  if (!response.ok) {
    const error = new Error(payload.error?.message || "Payment could not be prepared.") as Error & { code?: string; status?: number };
    error.code = payload.error?.code;
    error.status = response.status;
    throw error;
  }
  return payload as PaymentAttemptResponse;
}

export async function getStandardPaymentAttempt(attemptId: string) {
  const response = await fetch(`/api/payment-attempt?attemptId=${encodeURIComponent(attemptId)}`, {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  const payload = await response.json().catch(() => ({})) as PaymentAttemptResponse & ErrorPayload;
  if (!response.ok) {
    const error = new Error(payload.error?.message || "Payment status could not be checked.") as Error & { code?: string; status?: number };
    error.code = payload.error?.code;
    error.status = response.status;
    throw error;
  }
  return payload as PaymentAttemptResponse;
}
