export type CommercialAccountingEntry = {
  id: string;
  entry_type: string;
  reference: string;
  external_reference?: string | null;
  order_id?: string | null;
  invoice_id?: string | null;
  purchase_order_reference?: string | null;
  description: string;
  currency: string;
  debit_minor: number | string;
  credit_minor: number | string;
  occurred_at: string;
  due_at?: string | null;
  status: string;
  source: string;
  source_coverage: "smartcommerce_only" | "provider_synced" | string;
};

export type CommercialAccountingStatement = {
  account: {
    id: string;
    displayName: string;
    role: string;
    authorityStatus: string;
    verificationStatus: string;
    privilegeStatus: string;
  };
  period: { start: string; end: string };
  financialControls: null | {
    status: string;
    creditEnabled: boolean;
    creditLimitMinor: string | null;
    creditCurrency: string | null;
    paymentTermsCode: string | null;
    purchaseOrderEnabled: boolean;
    reviewedAt: string | null;
  };
  statement: {
    entries: CommercialAccountingEntry[];
    summary: {
      totalEntries: number;
      debitMinor: number;
      creditMinor: number;
      activityNetMinor: number;
      coverage: "smartcommerce_only" | "provider_synced";
      officialBalanceMinor: number | null;
    };
  };
  disclosure: string;
};

type ApiError = Error & { code?: string; status?: number };

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || "Commercial accounting request failed.") as ApiError;
    error.code = payload?.error?.code;
    error.status = response.status;
    throw error;
  }
  return payload as T;
}

export async function getCommercialAccountingStatement(accountId: string, start?: string, end?: string) {
  const params = new URLSearchParams({ accountId });
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  const response = await fetch(`/api/commercial-accounting?${params.toString()}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  return parseResponse<CommercialAccountingStatement>(response);
}

export function commercialStatementCsvUrl(accountId: string, start: string, end: string) {
  const params = new URLSearchParams({ accountId, start, end, format: "csv" });
  return `/api/commercial-accounting?${params.toString()}`;
}
