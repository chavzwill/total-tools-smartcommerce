import { neon } from "@neondatabase/serverless";
import {
  confirmPaymentFromProvider,
  failPaymentAttempt,
  markPaymentProviderPending,
} from "./paymentSettlement.js";
import type { PaymentProviderKey, PaymentProviderVerificationResult } from "./paymentProviderAdapters.js";

let sqlClient: ReturnType<typeof neon> | undefined;
function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("PAYMENT_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

async function authoritativeAttempt(attemptId: string) {
  const rows = await sql()`
    SELECT id, provider, currency, amount_minor, status, provider_payment_id
    FROM payment_attempts
    WHERE id=${attemptId}
    LIMIT 1
  ` as unknown as Array<any>;
  return rows[0] || null;
}

export async function applyVerifiedProviderEvidence(provider: PaymentProviderKey, evidence: PaymentProviderVerificationResult) {
  if (!evidence.attemptId) return { applied: false, reason: "NO_ATTEMPT_ID" as const };
  const attempt = await authoritativeAttempt(evidence.attemptId);
  if (!attempt) return { applied: false, reason: "ATTEMPT_NOT_FOUND" as const };

  const expectedProvider = String(attempt.provider || "").trim();
  if (expectedProvider && expectedProvider !== provider) {
    throw new Error("PAYMENT_PROVIDER_EVIDENCE_MISMATCH");
  }

  if (evidence.status === "confirmed") {
    if (String(attempt.currency || "").toUpperCase() !== evidence.currency.toUpperCase()) {
      throw new Error("PAYMENT_PROVIDER_CURRENCY_MISMATCH");
    }
    if (Number(attempt.amount_minor) !== Math.trunc(evidence.amountMinor)) {
      throw new Error("PAYMENT_PROVIDER_AMOUNT_MISMATCH");
    }
    if (!evidence.providerPaymentId || !evidence.providerReference) {
      throw new Error("PAYMENT_PROVIDER_EVIDENCE_INCOMPLETE");
    }
    const existingProviderPaymentId = String(attempt.provider_payment_id || "").trim();
    if (existingProviderPaymentId && existingProviderPaymentId !== evidence.providerPaymentId) {
      throw new Error("PAYMENT_PROVIDER_TRANSACTION_MISMATCH");
    }
    const confirmed = await confirmPaymentFromProvider({
      attemptId: evidence.attemptId,
      provider,
      providerPaymentId: evidence.providerPaymentId,
      providerReference: evidence.providerReference,
      confirmationSource: evidence.source,
    });
    return { applied: Boolean(confirmed), status: "confirmed" as const };
  }

  if (evidence.status === "pending" && evidence.providerPaymentId) {
    await markPaymentProviderPending({ attemptId: evidence.attemptId, provider, providerPaymentId: evidence.providerPaymentId });
    return { applied: true, status: "provider_pending" as const };
  }

  if (evidence.status === "failed") {
    await failPaymentAttempt({ attemptId: evidence.attemptId, failureCode: evidence.failureCode || "provider_failed" });
    return { applied: true, status: "failed" as const };
  }

  return { applied: false, reason: evidence.status.toUpperCase() };
}
