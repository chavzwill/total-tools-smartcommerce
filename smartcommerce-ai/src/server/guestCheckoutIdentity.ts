import { createHash, randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";

export const GUEST_CHECKOUT_COOKIE = "sc_guest_checkout";
const GUEST_SESSION_TTL_HOURS = 24;
let sqlClient: ReturnType<typeof neon> | undefined;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("GUEST_CHECKOUT_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

export function hashGuestToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function parseCookie(header?: string) {
  const result: Record<string, string> = {};
  for (const part of (header || "").split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try { result[key] = decodeURIComponent(value); } catch { result[key] = value; }
  }
  return result;
}

export function guestCheckoutCookie(token: string, secure = true) {
  return `${GUEST_CHECKOUT_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${GUEST_SESSION_TTL_HOURS * 3600}${secure ? "; Secure" : ""}`;
}

export async function ensureGuestCheckoutSchema() {
  await sql()`
    CREATE TABLE IF NOT EXISTS guest_checkout_sessions (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql()`CREATE INDEX IF NOT EXISTS guest_checkout_sessions_expiry_idx ON guest_checkout_sessions(expires_at, revoked_at)`;
  await sql()`
    CREATE TABLE IF NOT EXISTS guest_checkout_quotes (
      id TEXT PRIMARY KEY,
      guest_session_id TEXT NOT NULL REFERENCES guest_checkout_sessions(id) ON DELETE CASCADE,
      currency TEXT NOT NULL,
      subtotal_minor BIGINT NOT NULL CHECK (subtotal_minor >= 0),
      tax_minor BIGINT NOT NULL CHECK (tax_minor >= 0),
      delivery_minor BIGINT NOT NULL CHECK (delivery_minor >= 0),
      service_minor BIGINT NOT NULL CHECK (service_minor >= 0),
      total_minor BIGINT NOT NULL CHECK (total_minor >= 0),
      snapshot JSONB NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql()`CREATE INDEX IF NOT EXISTS guest_checkout_quotes_owner_idx ON guest_checkout_quotes(guest_session_id, expires_at DESC)`;
}

export async function guestSessionFromToken(token: string) {
  if (!token) return null;
  await ensureGuestCheckoutSchema();
  const rows = await sql()`
    SELECT id, expires_at
    FROM guest_checkout_sessions
    WHERE token_hash=${hashGuestToken(token)}
      AND revoked_at IS NULL
      AND expires_at > NOW()
    LIMIT 1
  ` as unknown as Array<{ id: string; expires_at: string }>;
  return rows[0] || null;
}

export async function createGuestSession() {
  await ensureGuestCheckoutSchema();
  const token = randomBytes(32).toString("base64url");
  const id = `gst_${randomBytes(16).toString("hex")}`;
  const expiresAt = new Date(Date.now() + GUEST_SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();
  await sql()`
    INSERT INTO guest_checkout_sessions(id, token_hash, expires_at)
    VALUES (${id}, ${hashGuestToken(token)}, ${expiresAt})
  `;
  return { id, token, expiresAt };
}

export async function getOrCreateGuestSession(token?: string) {
  if (token) {
    const existing = await guestSessionFromToken(token);
    if (existing) return { id: existing.id, token, expiresAt: existing.expires_at, created: false };
  }
  const created = await createGuestSession();
  return { ...created, created: true };
}

export async function persistGuestQuote(input: {
  id: string;
  guestSessionId: string;
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  deliveryMinor: number;
  serviceMinor: number;
  totalMinor: number;
  snapshot: unknown;
  expiresAt: string;
}) {
  await ensureGuestCheckoutSchema();
  await sql()`
    INSERT INTO guest_checkout_quotes(
      id, guest_session_id, currency, subtotal_minor, tax_minor, delivery_minor, service_minor, total_minor, snapshot, expires_at
    ) VALUES (
      ${input.id}, ${input.guestSessionId}, ${input.currency.toUpperCase()}, ${input.subtotalMinor}, ${input.taxMinor},
      ${input.deliveryMinor}, ${input.serviceMinor}, ${input.totalMinor}, ${JSON.stringify(input.snapshot)}::jsonb, ${input.expiresAt}
    )
    ON CONFLICT (id) DO NOTHING
  `;
}

export async function getGuestQuoteForSession(input: { guestSessionId: string; quoteId: string }) {
  await ensureGuestCheckoutSchema();
  const rows = await sql()`
    SELECT id, currency, subtotal_minor, tax_minor, delivery_minor, service_minor, total_minor, snapshot, expires_at
    FROM guest_checkout_quotes
    WHERE id=${input.quoteId} AND guest_session_id=${input.guestSessionId}
    LIMIT 1
  ` as unknown as Array<any>;
  return rows[0] || null;
}

export function guestPaymentSubject(guestSessionId: string) {
  return `guest:${guestSessionId}`;
}
