import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import {
  GUEST_CHECKOUT_COOKIE,
  guestPaymentSubject,
  guestSessionFromToken,
  parseCookie,
} from "./guestCheckoutIdentity.js";

const CUSTOMER_COOKIE = "sc_session";
let sqlClient: ReturnType<typeof neon> | undefined;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("PAYMENT_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export type PaymentPrincipal =
  | { kind: "customer"; subjectId: string; customerId: string }
  | { kind: "guest"; subjectId: string; guestSessionId: string };

export async function resolvePaymentPrincipal(request: any): Promise<PaymentPrincipal | null> {
  const cookies = parseCookie(firstHeader(request.headers?.cookie));
  const customerToken = cookies[CUSTOMER_COOKIE];
  if (customerToken) {
    const rows = await sql()`
      SELECT customer_id
      FROM customer_sessions
      WHERE token_hash=${hashToken(customerToken)}
        AND revoked_at IS NULL
        AND expires_at > NOW()
      LIMIT 1
    ` as Array<{ customer_id: string }>;
    if (rows[0]?.customer_id) {
      return { kind: "customer", subjectId: rows[0].customer_id, customerId: rows[0].customer_id };
    }
  }

  const guestToken = cookies[GUEST_CHECKOUT_COOKIE];
  if (!guestToken) return null;
  const guest = await guestSessionFromToken(guestToken);
  if (!guest) return null;
  return { kind: "guest", subjectId: guestPaymentSubject(guest.id), guestSessionId: guest.id };
}
