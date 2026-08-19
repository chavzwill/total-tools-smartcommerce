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

export type CommercialReceivableInvoice = {
  id: string;
  reference: string;
  invoiceId?: string | null;
  externalReference?: string | null;
  purchaseOrderReference?: string | null;
  description: string;
  currency: string;
  occurredAt: string;
  dueAt?: string | null;
  status: string;
  outstandingMinor: number;
  daysOverdue: number;
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
    reconciliation: null | {
      providerReference: string;
      currency: string;
      coverageStart: string;
      coverageEnd: string;
      openingBalanceMinor: number;
      closingBalanceMinor: number;
      reconciledAt: string;
    };
    summary: {
      totalEntries: number;
      providerSyncedEntries: number;
      debitMinor: number;
      creditMinor: number;
      activityNetMinor: number;
      coverage: "smartcommerce_only" | "provider_reconciled";
      officialOpeningBalanceMinor: number | null;
      officialBalanceMinor: number | null;
      officialCurrency: string | null;
    };
  };
  receivables: {
    totalOutstandingMinor: number;
    currentMinor: number;
    overdue1To30Minor: number;
    overdue31To60Minor: number;
    overdue61To90Minor: number;
    overdue90PlusMinor: number;
    invoices: CommercialReceivableInvoice[];
    authoritative: true;
    basis: "provider_invoice_outstanding";
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
