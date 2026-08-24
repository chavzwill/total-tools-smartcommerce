import { createHash, randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";

const ACCESS_TTL_DAYS = 30;
let sqlClient: ReturnType<typeof neon> | undefined;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("GUEST_ORDER_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function orderIdForAttempt(attemptId: string) {
  return `gord_${hash(`guest-order:${attemptId}`).slice(0, 28)}`;
}

export async function ensureGuestOrderSchema() {
  await sql()`
    CREATE TABLE IF NOT EXISTS guest_orders (
      id TEXT PRIMARY KEY,
      guest_session_id TEXT NOT NULL REFERENCES guest_checkout_sessions(id) ON DELETE RESTRICT,
      quote_id TEXT NOT NULL UNIQUE,
      payment_attempt_id TEXT NOT NULL UNIQUE,
      provider TEXT NOT NULL,
      provider_payment_id TEXT NOT NULL,
      provider_reference TEXT NOT NULL,
      currency TEXT NOT NULL,
      total_minor BIGINT NOT NULL CHECK (total_minor >= 0),
      status TEXT NOT NULL CHECK (status IN ('paid')),
      snapshot JSONB NOT NULL,
      paid_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql()`CREATE INDEX IF NOT EXISTS guest_orders_owner_idx ON guest_orders(guest_session_id, created_at DESC)`;
  await sql()`
    CREATE TABLE IF NOT EXISTS guest_order_access_tokens (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES guest_orders(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql()`CREATE INDEX IF NOT EXISTS guest_order_access_expiry_idx ON guest_order_access_tokens(expires_at, revoked_at)`;
}

export async function finalizeGuestOrderForConfirmedAttempt(attemptId: string) {
  await ensureGuestOrderSchema();
  const attempts = await sql()`
    SELECT id, customer_id, quote_id, provider, currency, amount_minor, status,
           provider_payment_id, provider_reference, confirmation_source, confirmed_at
    FROM payment_attempts
    WHERE id=${attemptId}
    LIMIT 1
  ` as unknown as Array<any>;
  const attempt = attempts[0];
  if (!attempt || attempt.status !== "confirmed") return null;
  const subject = String(attempt.customer_id || "");
  if (!subject.startsWith("guest:")) return null;
  const guestSessionId = subject.slice("guest:".length);
  if (!guestSessionId) return null;

  const quotes = await sql()`
    SELECT id, currency, subtotal_minor, tax_minor, delivery_minor, service_minor, total_minor, snapshot, expires_at
    FROM guest_checkout_quotes
    WHERE id=${attempt.quote_id} AND guest_session_id=${guestSessionId}
    LIMIT 1
  ` as unknown as Array<any>;
  const quote = quotes[0];
  if (!quote) throw new Error("GUEST_ORDER_QUOTE_NOT_FOUND");
  const snapshot = typeof quote.snapshot === "string" ? JSON.parse(quote.snapshot) : quote.snapshot;
  if (!snapshot?.fulfilment || snapshot.fulfilment.status !== "bound") throw new Error("GUEST_ORDER_FULFILMENT_NOT_BOUND");
  if (String(quote.currency || "").toUpperCase() !== String(attempt.currency || "").toUpperCase()) throw new Error("GUEST_ORDER_CURRENCY_MISMATCH");
  if (Number(quote.total_minor) !== Number(attempt.amount_minor)) throw new Error("GUEST_ORDER_AMOUNT_MISMATCH");

  const id = orderIdForAttempt(attempt.id);
  const frozenSnapshot = {
    items: Array.isArray(snapshot?.items) ? snapshot.items : [],
    fulfilment: snapshot.fulfilment,
    pricing: {
      subtotalMinor: Number(quote.subtotal_minor || 0),
      taxMinor: Number(quote.tax_minor || 0),
      deliveryMinor: Number(quote.delivery_minor || 0),
      serviceMinor: Number(quote.service_minor || 0),
      totalMinor: Number(quote.total_minor || 0),
      currency: String(quote.currency || "JMD").toUpperCase(),
    },
    payment: {
      methodAttemptId: attempt.id,
      provider: attempt.provider,
      providerPaymentId: attempt.provider_payment_id,
      providerReference: attempt.provider_reference,
      confirmationSource: attempt.confirmation_source,
      confirmedAt: attempt.confirmed_at,
    },
  };

  const rows = await sql()`
    INSERT INTO guest_orders(
      id, guest_session_id, quote_id, payment_attempt_id, provider, provider_payment_id,
      provider_reference, currency, total_minor, status, snapshot, paid_at
    ) VALUES (
      ${id}, ${guestSessionId}, ${attempt.quote_id}, ${attempt.id}, ${String(attempt.provider || "")},
      ${String(attempt.provider_payment_id || "")}, ${String(attempt.provider_reference || "")},
      ${String(attempt.currency || "JMD").toUpperCase()}, ${Number(attempt.amount_minor || 0)}, 'paid',
      ${JSON.stringify(frozenSnapshot)}::jsonb, ${attempt.confirmed_at || new Date().toISOString()}
    )
    ON CONFLICT (payment_attempt_id) DO UPDATE SET updated_at=NOW()
    RETURNING *
  ` as unknown as Array<any>;
  return rows[0] || null;
}

export async function getGuestOrderForSession(input: { guestSessionId: string; orderId?: string; attemptId?: string }) {
  await ensureGuestOrderSchema();
  const rows = input.orderId
    ? await sql()`SELECT * FROM guest_orders WHERE id=${input.orderId} AND guest_session_id=${input.guestSessionId} LIMIT 1` as unknown as Array<any>
    : await sql()`SELECT * FROM guest_orders WHERE payment_attempt_id=${input.attemptId || ""} AND guest_session_id=${input.guestSessionId} LIMIT 1` as unknown as Array<any>;
  return rows[0] || null;
}

export async function issueGuestOrderAccessToken(input: { guestSessionId: string; orderId: string }) {
  await ensureGuestOrderSchema();
  const order = await getGuestOrderForSession(input);
  if (!order) return null;
  const token = randomBytes(32).toString("base64url");
  const id = `goat_${randomBytes(12).toString("hex")}`;
  const expiresAt = new Date(Date.now() + ACCESS_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await sql()`
    INSERT INTO guest_order_access_tokens(id, order_id, token_hash, expires_at)
    VALUES (${id}, ${input.orderId}, ${hash(token)}, ${expiresAt})
  `;
  return { token, expiresAt };
}

export async function getGuestOrderByAccessToken(input: { orderId: string; token: string }) {
  await ensureGuestOrderSchema();
  if (!input.orderId || !input.token) return null;
  const rows = await sql()`
    SELECT o.*
    FROM guest_orders o
    JOIN guest_order_access_tokens t ON t.order_id=o.id
    WHERE o.id=${input.orderId}
      AND t.token_hash=${hash(input.token)}
      AND t.revoked_at IS NULL
      AND t.expires_at > NOW()
    ORDER BY t.created_at DESC
    LIMIT 1
  ` as unknown as Array<any>;
  return rows[0] || null;
}
