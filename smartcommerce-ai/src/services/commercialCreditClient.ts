export type CommercialCreditAvailability = {
  approved: boolean;
  commercialAccountId: string;
  paymentTermsCode?: string | null;
  basis?: string;
  credit: null | {
    creditLimitMinor: number;
    outstandingMinor: number;
    reservedMinor: number;
    availableMinor: number;
    currency: string;
  };
};

type ApiError = { error?: { code?: string; message?: string } };

export async function getCommercialCreditAvailability(commercialAccountId: string) {
  const response = await fetch(`/api/commercial-credit-availability?commercialAccountId=${encodeURIComponent(commercialAccountId)}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  const payload = await response.json().catch(() => ({})) as CommercialCreditAvailability & ApiError;
  if (!response.ok) {
    const error = new Error(payload.error?.message || "Commercial credit availability could not be loaded.") as Error & { status?: number; code?: string };
    error.status = response.status;
    error.code = payload.error?.code;
    throw error;
  }
  return payload as CommercialCreditAvailability;
}
