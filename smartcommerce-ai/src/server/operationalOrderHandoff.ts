import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";

let sqlClient: ReturnType<typeof neon> | undefined;
function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("OPERATIONAL_ORDER_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

function stableId(prefix: string, value: string) {
  return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 28)}`;
}

function snapshotObject(value: any) {
  if (!value) return {};
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return {}; }
  }
  return value;
}

export async function ensureOperationalOrderHandoffSchema() {
  await sql()`
    CREATE TABLE IF NOT EXISTS operational_orders (
      id TEXT PRIMARY KEY,
      payment_attempt_id TEXT NOT NULL UNIQUE,
      quote_id TEXT NOT NULL UNIQUE,
      subject_id TEXT NOT NULL,
      subject_kind TEXT NOT NULL CHECK (subject_kind IN ('customer','guest')),
      currency TEXT NOT NULL,
      amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
      payment_provider TEXT,
      payment_reference TEXT,
      payment_confirmed_at TIMESTAMPTZ NOT NULL,
      fulfilment_mode TEXT NOT NULL CHECK (fulfilment_mode IN ('pickup','delivery')),
      fulfilment_status TEXT NOT NULL DEFAULT 'awaiting_operations',
      tracking_reference TEXT NOT NULL UNIQUE,
      snapshot JSONB NOT NULL,
      pos_handoff_status TEXT NOT NULL DEFAULT 'pending' CHECK (pos_handoff_status IN ('pending','processing','acknowledged','failed')),
      pos_order_reference TEXT,
      inventory_commitment_status TEXT NOT NULL DEFAULT 'committed_internal' CHECK (inventory_commitment_status IN ('committed_internal','provider_acknowledged','released')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql()`
    CREATE TABLE IF NOT EXISTS operational_order_inventory_commitments (
      order_id TEXT NOT NULL REFERENCES operational_orders(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL,
      branch_id TEXT,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      status TEXT NOT NULL DEFAULT 'committed_internal' CHECK (status IN ('committed_internal','provider_acknowledged','released')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(order_id, product_id)
    )
  `;
  await sql()`
    CREATE TABLE IF NOT EXISTS operational_order_events (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES operational_orders(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      event_key TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(order_id, event_key)
    )
  `;
  await sql()`
    CREATE TABLE IF NOT EXISTS operational_order_outbox (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES operational_orders(id) ON DELETE CASCADE,
      destination TEXT NOT NULL CHECK (destination IN ('pos_order_write','inventory_commitment','fulfilment_activation')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','acknowledged','failed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error_code TEXT,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      acknowledged_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(order_id, destination)
    )
  `;
  await sql()`CREATE INDEX IF NOT EXISTS operational_orders_subject_idx ON operational_orders(subject_id, created_at DESC)`;
  await sql()`CREATE INDEX IF NOT EXISTS operational_outbox_pending_idx ON operational_order_outbox(status, next_attempt_at)`;
}

async function confirmedAttempt(attemptId: string) {
  const rows = await sql()`
    SELECT id, customer_id, quote_id, provider, currency, amount_minor, provider_reference, confirmed_at
    FROM payment_attempts
    WHERE id=${attemptId} AND status='confirmed'
    LIMIT 1
  ` as unknown as Array<any>;
  return rows[0] || null;
}

async function quoteForAttempt(attempt: any) {
  const subjectId = String(attempt.customer_id || "");
  if (subjectId.startsWith("guest:")) {
    const guestId = subjectId.slice("guest:".length);
    const rows = await sql()`
      SELECT id, currency, total_minor, snapshot
      FROM guest_checkout_quotes
      WHERE id=${attempt.quote_id} AND guest_session_id=${guestId}
      LIMIT 1
    ` as unknown as Array<any>;
    return { kind: "guest" as const, subjectId: guestId, quote: rows[0] || null };
  }
  const rows = await sql()`
    SELECT id, currency, total_minor, snapshot
    FROM checkout_quotes
    WHERE id=${attempt.quote_id} AND customer_id=${subjectId}
    LIMIT 1
  ` as unknown as Array<any>;
  return { kind: "customer" as const, subjectId, quote: rows[0] || null };
}

function deriveFulfilment(snapshot: any) {
  const fulfilment = snapshotObject(snapshot)?.fulfilment || {};
  if (fulfilment.status !== "bound") throw new Error("OPERATIONAL_ORDER_FULFILMENT_NOT_BOUND");
  const mode = fulfilment.mode === "delivery" ? "delivery" : fulfilment.mode === "pickup" ? "pickup" : null;
  if (!mode) throw new Error("OPERATIONAL_ORDER_FULFILMENT_INVALID");
  return { mode, fulfilment } as const;
}

export async function ensureOperationalOrderForConfirmedAttempt(attemptId: string) {
  await ensureOperationalOrderHandoffSchema();
  const attempt = await confirmedAttempt(attemptId);
  if (!attempt) return null;
  const source = await quoteForAttempt(attempt);
  if (!source.quote) throw new Error("OPERATIONAL_ORDER_QUOTE_NOT_FOUND");
  if (String(source.quote.currency || "").toUpperCase() !== String(attempt.currency || "").toUpperCase()) throw new Error("OPERATIONAL_ORDER_CURRENCY_MISMATCH");
  if (Number(source.quote.total_minor) !== Number(attempt.amount_minor)) throw new Error("OPERATIONAL_ORDER_AMOUNT_MISMATCH");

  const snapshot = snapshotObject(source.quote.snapshot);
  const { mode } = deriveFulfilment(snapshot);
  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
  if (!items.length) throw new Error("OPERATIONAL_ORDER_ITEMS_MISSING");

  const orderId = stableId("ord", attempt.id);
  const trackingReference = stableId("trk", orderId);
  const paymentConfirmedAt = attempt.confirmed_at || new Date().toISOString();
  const rows = await sql()`
    INSERT INTO operational_orders(
      id, payment_attempt_id, quote_id, subject_id, subject_kind, currency, amount_minor,
      payment_provider, payment_reference, payment_confirmed_at, fulfilment_mode, tracking_reference, snapshot
    ) VALUES (
      ${orderId}, ${attempt.id}, ${attempt.quote_id}, ${source.subjectId}, ${source.kind}, ${String(attempt.currency).toUpperCase()}, ${Math.trunc(Number(attempt.amount_minor))},
      ${attempt.provider || null}, ${attempt.provider_reference || null}, ${paymentConfirmedAt}, ${mode}, ${trackingReference}, ${JSON.stringify(snapshot)}::jsonb
    )
    ON CONFLICT (payment_attempt_id) DO UPDATE SET updated_at=operational_orders.updated_at
    RETURNING *
  ` as unknown as Array<any>;
  const order = rows[0] || (await sql()`SELECT * FROM operational_orders WHERE payment_attempt_id=${attempt.id} LIMIT 1` as unknown as Array<any>)[0];

  for (const raw of items) {
    const productId = String(raw?.productId || "").trim();
    const quantity = Math.max(1, Math.min(999, Math.trunc(Number(raw?.quantity || 0))));
    if (!productId || !Number.isInteger(quantity)) continue;
    const branchId = String(raw?.inventory?.branchId || snapshot?.inventory?.branchId || "").trim() || null;
    await sql()`
      INSERT INTO operational_order_inventory_commitments(order_id, product_id, branch_id, quantity)
      VALUES (${order.id}, ${productId}, ${branchId}, ${quantity})
      ON CONFLICT (order_id, product_id) DO NOTHING
    `;
  }

  const events = [
    { type: "payment_verified", key: `payment:${attempt.id}`, payload: { provider: attempt.provider || null, reference: attempt.provider_reference || null } },
    { type: "order_created", key: `order:${order.id}`, payload: { trackingReference } },
    { type: "fulfilment_activated", key: `fulfilment:${order.id}`, payload: { mode } },
  ];
  for (const event of events) {
    await sql()`
      INSERT INTO operational_order_events(id, order_id, event_type, event_key, payload)
      VALUES (${stableId("evt", `${order.id}:${event.key}`)}, ${order.id}, ${event.type}, ${event.key}, ${JSON.stringify(event.payload)}::jsonb)
      ON CONFLICT (order_id, event_key) DO NOTHING
    `;
  }

  for (const destination of ["pos_order_write", "inventory_commitment", "fulfilment_activation"] as const) {
    await sql()`
      INSERT INTO operational_order_outbox(id, order_id, destination)
      VALUES (${stableId("out", `${order.id}:${destination}`)}, ${order.id}, ${destination})
      ON CONFLICT (order_id, destination) DO NOTHING
    `;
  }
  return order;
}

export async function getOperationalOrderForSubject(input: { subjectId: string; orderId?: string; trackingReference?: string }) {
  await ensureOperationalOrderHandoffSchema();
  const rows = input.orderId
    ? await sql()`SELECT * FROM operational_orders WHERE id=${input.orderId} AND subject_id=${input.subjectId} LIMIT 1` as unknown as Array<any>
    : await sql()`SELECT * FROM operational_orders WHERE tracking_reference=${input.trackingReference || ""} AND subject_id=${input.subjectId} LIMIT 1` as unknown as Array<any>;
  return rows[0] || null;
}
