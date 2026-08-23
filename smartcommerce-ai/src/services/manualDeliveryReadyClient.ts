export type ReadyManualDeliveryReview = {
  id: string;
  providerName?: string | null;
  vehicleClass?: string | null;
  providerCostMinor: number;
  operationsMarkupMinor: number;
  customerChargeMinor: number;
  currency: string;
  scheduledFor?: string | null;
  staffNotes?: string | null;
  address?: any;
  reviewedAt?: string | null;
};

type ErrorPayload = { error?: { code?: string; message?: string } };

async function payload<T>(response: Response) {
  const value = await response.json().catch(() => ({})) as T & ErrorPayload;
  if (!response.ok) {
    const error = new Error(value.error?.message || "Reviewed delivery pricing could not be loaded.") as Error & { code?: string; status?: number };
    error.code = value.error?.code;
    error.status = response.status;
    throw error;
  }
  return value;
}

export async function listReadyManualDeliveryReviews(quoteId: string) {
  const response = await fetch(`/api/manual-delivery-ready?quoteId=${encodeURIComponent(quoteId)}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  return payload<{ reviews: ReadyManualDeliveryReview[] }>(response);
}

export async function attachReadyManualDeliveryReview(quoteId: string, reviewId: string) {
  const response = await fetch("/api/manual-delivery-ready", {
    method: "POST",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ quoteId, reviewId }),
  });
  return payload<{
    fulfilment: any;
    quote: { id: string; deliveryMinor: number; totalMinor: number };
    review: { id: string; status: string };
  }>(response);
}
