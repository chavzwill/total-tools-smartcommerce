import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { ensureCommercialAccountingSchema } from "./commercialAccountingLedger.js";

let sqlClient: ReturnType<typeof neon> | undefined;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("COMMERCIAL_CREDIT_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

function reservationId(accountId: string, quoteId: string) {
  return `ccr_${createHash("sha256").update(`${accountId}:${quoteId}`).digest("hex").slice(0, 30)}`;
}

export async function ensureCommercialCreditReservationSchema() {
  await ensureCommercialAccountingSchema();
  await sql()`
    CREATE TABLE IF NOT EXISTS commercial_credit_reservations (
      id TEXT PRIMARY KEY,
      commercial_account_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      quote_id TEXT NOT NULL,
      currency TEXT NOT NULL,
      amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
      status TEXT NOT NULL CHECK (status IN ('reserved','committed','released')),
      order_id TEXT,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (commercial_account_id, quote_id)
    )
  `;
  await sql()`CREATE INDEX IF NOT EXISTS commercial_credit_reservations_account_status_idx ON commercial_credit_reservations(commercial_account_id, status, expires_at)`;
}

export async function getCommercialCreditAvailability(input: {
  commercialAccountId: string;
  currency: string;
  creditLimitMinor: number;
}) {
  await ensureCommercialCreditReservationSchema();
  const currency = input.currency.toUpperCase();
  const rows = await sql()`
    SELECT
      COALESCE((
        SELECT SUM((metadata->>'outstandingMinor')::bigint)
        FROM commercial_account_ledger_entries
        WHERE commercial_account_id=${input.commercialAccountId}
          AND entry_type='invoice'
          AND source_coverage='provider_synced'
          AND UPPER(currency)=${currency}
          AND status NOT IN ('void','cancelled','reversed')
          AND (metadata->>'outstandingMinor') ~ '^[0-9]+$'
          AND (metadata->>'outstandingMinor')::bigint > 0
      ),0)::bigint AS outstanding_minor,
      COALESCE((
        SELECT SUM(r.amount_minor)
        FROM commercial_credit_reservations r
        WHERE r.commercial_account_id=${input.commercialAccountId}
          AND UPPER(r.currency)=${currency}
          AND (
            (r.status='reserved' AND r.expires_at > NOW()) OR
            (r.status='committed' AND NOT EXISTS (
              SELECT 1 FROM commercial_account_ledger_entries l
              WHERE l.commercial_account_id=r.commercial_account_id
                AND l.source_coverage='provider_synced'
                AND r.order_id IS NOT NULL
                AND (l.order_id=r.order_id OR l.external_reference=r.order_id OR l.reference=r.order_id)
            ))
          )
      ),0)::bigint AS reserved_minor
  ` as unknown as Array<{ outstanding_minor: number | string; reserved_minor: number | string }>;
  const outstandingMinor = Number(rows[0]?.outstanding_minor || 0);
  const reservedMinor = Number(rows[0]?.reserved_minor || 0);
  const creditLimitMinor = Math.max(0, Math.trunc(input.creditLimitMinor || 0));
  return {
    creditLimitMinor,
    outstandingMinor,
    reservedMinor,
    availableMinor: Math.max(0, creditLimitMinor - outstandingMinor - reservedMinor),
    currency,
  };
}

export async function acquireCommercialCreditReservation(input: {
  commercialAccountId: string;
  customerId: string;
  quoteId: string;
  currency: string;
  amountMinor: number;
  creditLimitMinor: number;
}) {
  await ensureCommercialCreditReservationSchema();
  const id = reservationId(input.commercialAccountId, input.quoteId);
  const currency = input.currency.toUpperCase();
  const amountMinor = Math.max(0, Math.trunc(input.amountMinor || 0));
  const creditLimitMinor = Math.max(0, Math.trunc(input.creditLimitMinor || 0));
  if (!amountMinor || !creditLimitMinor) return { acquired: false as const, reason: "invalid_amount" as const };

  const rows = await sql()`
    WITH lock_row AS MATERIALIZED (
      SELECT pg_advisory_xact_lock(hashtext(${input.commercialAccountId})) AS locked
    ),
    outstanding AS MATERIALIZED (
      SELECT COALESCE(SUM((l.metadata->>'outstandingMinor')::bigint),0)::bigint AS amount
      FROM commercial_account_ledger_entries l, lock_row
      WHERE l.commercial_account_id=${input.commercialAccountId}
        AND l.entry_type='invoice'
        AND l.source_coverage='provider_synced'
        AND UPPER(l.currency)=${currency}
        AND l.status NOT IN ('void','cancelled','reversed')
        AND (l.metadata->>'outstandingMinor') ~ '^[0-9]+$'
        AND (l.metadata->>'outstandingMinor')::bigint > 0
    ),
    active_reservations AS MATERIALIZED (
      SELECT COALESCE(SUM(r.amount_minor),0)::bigint AS amount
      FROM commercial_credit_reservations r, lock_row
      WHERE r.commercial_account_id=${input.commercialAccountId}
        AND UPPER(r.currency)=${currency}
        AND r.id<>${id}
        AND (
          (r.status='reserved' AND r.expires_at > NOW()) OR
          (r.status='committed' AND NOT EXISTS (
            SELECT 1 FROM commercial_account_ledger_entries l
            WHERE l.commercial_account_id=r.commercial_account_id
              AND l.source_coverage='provider_synced'
              AND r.order_id IS NOT NULL
              AND (l.order_id=r.order_id OR l.external_reference=r.order_id OR l.reference=r.order_id)
          ))
        )
    ),
    capacity AS MATERIALIZED (
      SELECT GREATEST(0, ${creditLimitMinor}::bigint - outstanding.amount - active_reservations.amount)::bigint AS available,
             outstanding.amount AS outstanding,
             active_reservations.amount AS reserved
      FROM outstanding, active_reservations
    ),
    reserved AS (
      INSERT INTO commercial_credit_reservations(
        id, commercial_account_id, customer_id, quote_id, currency, amount_minor,
        status, expires_at, created_at, updated_at
      )
      SELECT ${id}, ${input.commercialAccountId}, ${input.customerId}, ${input.quoteId}, ${currency}, ${amountMinor},
             'reserved', NOW()+INTERVAL '10 minutes', NOW(), NOW()
      FROM capacity
      WHERE ${amountMinor}::bigint <= capacity.available
      ON CONFLICT (commercial_account_id, quote_id) DO UPDATE
        SET customer_id=EXCLUDED.customer_id,
            currency=EXCLUDED.currency,
            amount_minor=EXCLUDED.amount_minor,
            status='reserved',
            order_id=NULL,
            expires_at=NOW()+INTERVAL '10 minutes',
            updated_at=NOW()
        WHERE commercial_credit_reservations.status='released'
           OR (commercial_credit_reservations.status='reserved' AND commercial_credit_reservations.expires_at <= NOW())
      RETURNING id, status, amount_minor, expires_at, order_id
    )
    SELECT r.id, r.status, r.amount_minor, r.expires_at, r.order_id,
           c.available, c.outstanding, c.reserved
    FROM reserved r CROSS JOIN capacity c
  ` as unknown as Array<any>;

  if (rows[0]) {
    return {
      acquired: true as const,
      reservationId: String(rows[0].id),
      amountMinor: Number(rows[0].amount_minor),
      availableBeforeMinor: Number(rows[0].available),
      outstandingMinor: Number(rows[0].outstanding),
      alreadyReservedMinor: Number(rows[0].reserved),
      expiresAt: rows[0].expires_at,
    };
  }

  const existing = await sql()`
    SELECT id,status,amount_minor,expires_at,order_id
    FROM commercial_credit_reservations
    WHERE commercial_account_id=${input.commercialAccountId} AND quote_id=${input.quoteId}
    LIMIT 1
  ` as unknown as Array<any>;
  if (existing[0]?.status === "committed") {
    return { acquired: false as const, reason: "already_committed" as const, orderId: existing[0].order_id || null };
  }
  if (existing[0]?.status === "reserved" && new Date(existing[0].expires_at).getTime() > Date.now()) {
    return { acquired: false as const, reason: "already_in_progress" as const };
  }
  const availability = await getCommercialCreditAvailability({ commercialAccountId: input.commercialAccountId, currency, creditLimitMinor });
  return { acquired: false as const, reason: "insufficient_credit" as const, ...availability };
}

export async function commitCommercialCreditReservation(reservationIdValue: string, orderId: string) {
  await ensureCommercialCreditReservationSchema();
  await sql()`
    UPDATE commercial_credit_reservations
    SET status='committed', order_id=${orderId}, expires_at=NULL, updated_at=NOW()
    WHERE id=${reservationIdValue} AND status='reserved'
  `;
}

export async function releaseCommercialCreditReservation(reservationIdValue: string) {
  await ensureCommercialCreditReservationSchema();
  await sql()`
    UPDATE commercial_credit_reservations
    SET status='released', expires_at=NULL, updated_at=NOW()
    WHERE id=${reservationIdValue} AND status='reserved'
  `;
}
