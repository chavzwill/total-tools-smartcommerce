import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";

let sqlClient: ReturnType<typeof neon> | undefined;
function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("PAYMENT_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

export type PaymentMethodId = "apple-pay" | "google-pay" | "click-to-pay" | "paypal" | "card" | "pay-in-store";
export type PaymentAttemptStatus = "prepared" | "provider_pending" | "confirmed" | "failed" | "cancelled";

function attemptId(customerId: string, quoteId: string, method: PaymentMethodId) {
  return `pay_${createHash("sha256").update(`${customerId}:${quoteId}:${method}`).digest("hex").slice(0, 30)}`;
}

export async function ensurePaymentSettlementSchema() {
  await sql()`
    CREATE TABLE IF NOT EXISTS payment_attempts (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      quote_id TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      provider TEXT,
      currency TEXT NOT NULL,
      amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
      status TEXT NOT NULL CHECK (status IN ('prepared','provider_pending','confirmed','failed','cancelled')),
      provider_payment_id TEXT,
      provider_reference TEXT,
      failure_code TEXT,
      confirmation_source TEXT,
      confirmed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(customer_id, quote_id, payment_method)
    )
  `;
  await sql()`CREATE INDEX IF NOT EXISTS payment_attempts_quote_idx ON payment_attempts(quote_id, status, updated_at DESC)`;
  await sql()`CREATE INDEX IF NOT EXISTS payment_attempts_provider_idx ON payment_attempts(provider, provider_payment_id)`;
}

export async function preparePaymentAttempt(input: {
  customerId: string;
  quoteId: string;
  method: PaymentMethodId;
  provider?: string | null;
  currency: string;
  amountMinor: number;
}) {
  await ensurePaymentSettlementSchema();
  const id = attemptId(input.customerId, input.quoteId, input.method);
  const rows = await sql()`
    INSERT INTO payment_attempts(id, customer_id, quote_id, payment_method, provider, currency, amount_minor, status)
    VALUES (${id}, ${input.customerId}, ${input.quoteId}, ${input.method}, ${input.provider || null}, ${input.currency.toUpperCase()}, ${Math.max(0, Math.trunc(input.amountMinor || 0))}, 'prepared')
    ON CONFLICT (customer_id, quote_id, payment_method)
    DO UPDATE SET
      provider=EXCLUDED.provider,
      currency=EXCLUDED.currency,
      amount_minor=EXCLUDED.amount_minor,
      updated_at=NOW()
    WHERE payment_attempts.status IN ('prepared','failed','cancelled')
    RETURNING *
  ` as unknown as Array<any>;

  if (rows[0]) return rows[0];
  const existing = await sql()`SELECT * FROM payment_attempts WHERE id=${id} LIMIT 1` as unknown as Array<any>;
  return existing[0];
}

export async function getPaymentAttemptForCustomer(input: { customerId: string; attemptId: string }) {
  await ensurePaymentSettlementSchema();
  const rows = await sql()`
    SELECT id, quote_id, payment_method, provider, currency, amount_minor, status,
           provider_reference, confirmation_source, confirmed_at, created_at, updated_at
    FROM payment_attempts
    WHERE id=${input.attemptId} AND customer_id=${input.customerId}
    LIMIT 1
  ` as unknown as Array<any>;
  return rows[0] || null;
}

export async function markPaymentProviderPending(input: { attemptId: string; provider: string; providerPaymentId: string }) {
  await ensurePaymentSettlementSchema();
  await sql()`
    UPDATE payment_attempts
    SET provider=${input.provider}, provider_payment_id=${input.providerPaymentId}, status='provider_pending', updated_at=NOW()
    WHERE id=${input.attemptId} AND status='prepared'
  `;
}

export async function confirmPaymentFromProvider(input: {
  attemptId: string;
  provider: string;
  providerPaymentId: string;
  providerReference: string;
  confirmationSource: "verified_webhook" | "server_side_provider_query" | "verified_pos_confirmation";
}) {
  await ensurePaymentSettlementSchema();
  const rows = await sql()`
    UPDATE payment_attempts
    SET provider=${input.provider}, provider_payment_id=${input.providerPaymentId}, provider_reference=${input.providerReference},
        confirmation_source=${input.confirmationSource}, status='confirmed', confirmed_at=NOW(), updated_at=NOW(), failure_code=NULL
    WHERE id=${input.attemptId}
      AND status IN ('prepared','provider_pending')
    RETURNING *
  ` as unknown as Array<any>;
  return rows[0] || null;
}

export async function failPaymentAttempt(input: { attemptId: string; failureCode: string }) {
  await ensurePaymentSettlementSchema();
  await sql()`
    UPDATE payment_attempts
    SET status='failed', failure_code=${input.failureCode.slice(0, 120)}, updated_at=NOW()
    WHERE id=${input.attemptId} AND status IN ('prepared','provider_pending')
  `;
}
