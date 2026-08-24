type RecheckResult = {
  attemptId: string;
  provider: string;
  applied: boolean;
  status: string | null;
};

type ApiError = Error & { code?: string; status?: number };

export async function recheckPaymentProvider(attemptId: string) {
  const response = await fetch("/api/payment-provider-recheck", {
    method: "POST",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ attemptId }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || "Payment provider recheck failed.") as ApiError;
    error.code = payload?.error?.code;
    error.status = response.status;
    throw error;
  }
  return payload as RecheckResult;
}
