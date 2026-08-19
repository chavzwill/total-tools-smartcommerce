import {
  recordCommercialLedgerEntry,
  recordCommercialReconciliationCheckpoint,
  type CommercialLedgerEntryType,
  type CommercialReconciliationCheckpointInput,
} from "./commercialAccountingLedger.js";

export type ProviderAccountingEvent = {
  commercialAccountId: string;
  customerId?: string | null;
  type: "invoice" | "payment" | "credit_note" | "refund" | "adjustment_debit" | "adjustment_credit" | "opening_balance";
  providerReference: string;
  reference?: string;
  orderId?: string | null;
  invoiceId?: string | null;
  purchaseOrderReference?: string | null;
  description: string;
  currency: string;
  amountMinor: number;
  occurredAt: string;
  dueAt?: string | null;
  status?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type ProviderReconciliationCheckpoint = CommercialReconciliationCheckpointInput;

function direction(type: ProviderAccountingEvent["type"], amountMinor: number) {
  const amount = Math.max(0, Math.trunc(Number(amountMinor || 0)));
  if (["payment", "credit_note", "refund", "adjustment_credit"].includes(type)) {
    return { debitMinor: 0, creditMinor: amount };
  }
  return { debitMinor: amount, creditMinor: 0 };
}

function ledgerType(type: ProviderAccountingEvent["type"]): CommercialLedgerEntryType {
  return type;
}

export async function syncProviderAccountingEvent(event: ProviderAccountingEvent) {
  if (!event.commercialAccountId?.trim()) throw new Error("ACCOUNTING_SYNC_ACCOUNT_REQUIRED");
  if (!event.providerReference?.trim()) throw new Error("ACCOUNTING_SYNC_REFERENCE_REQUIRED");
  if (!event.description?.trim()) throw new Error("ACCOUNTING_SYNC_DESCRIPTION_REQUIRED");
  if (!Number.isSafeInteger(event.amountMinor) || event.amountMinor < 0) throw new Error("ACCOUNTING_SYNC_AMOUNT_INVALID");
  if (!event.currency?.trim()) throw new Error("ACCOUNTING_SYNC_CURRENCY_REQUIRED");
  if (!Number.isFinite(new Date(event.occurredAt).getTime())) throw new Error("ACCOUNTING_SYNC_OCCURRED_AT_INVALID");
  if (event.dueAt && !Number.isFinite(new Date(event.dueAt).getTime())) throw new Error("ACCOUNTING_SYNC_DUE_AT_INVALID");

  const amounts = direction(event.type, event.amountMinor);
  return recordCommercialLedgerEntry({
    commercialAccountId: event.commercialAccountId.trim(),
    customerId: event.customerId || null,
    entryType: ledgerType(event.type),
    reference: (event.reference || event.providerReference).trim(),
    externalReference: event.providerReference.trim(),
    orderId: event.orderId || null,
    invoiceId: event.invoiceId || null,
    purchaseOrderReference: event.purchaseOrderReference || null,
    description: event.description.trim(),
    currency: event.currency.trim().toUpperCase(),
    debitMinor: amounts.debitMinor,
    creditMinor: amounts.creditMinor,
    occurredAt: event.occurredAt,
    dueAt: event.dueAt || null,
    status: event.status || "posted",
    source: "accounting_sync",
    sourceCoverage: "provider_synced",
    metadata: event.metadata || {},
  });
}

export async function syncProviderAccountingBatch(events: ProviderAccountingEvent[]) {
  if (!Array.isArray(events) || events.length === 0 || events.length > 500) throw new Error("ACCOUNTING_SYNC_BATCH_INVALID");
  const results = [];
  for (const event of events) results.push(await syncProviderAccountingEvent(event));
  return results;
}

export async function syncProviderReconciliationCheckpoint(checkpoint: ProviderReconciliationCheckpoint) {
  if (!checkpoint.commercialAccountId?.trim()) throw new Error("ACCOUNTING_SYNC_ACCOUNT_REQUIRED");
  if (!checkpoint.providerReference?.trim()) throw new Error("ACCOUNTING_SYNC_RECONCILIATION_REFERENCE_REQUIRED");
  if (!checkpoint.currency?.trim()) throw new Error("ACCOUNTING_SYNC_CURRENCY_REQUIRED");
  return recordCommercialReconciliationCheckpoint(checkpoint);
}
