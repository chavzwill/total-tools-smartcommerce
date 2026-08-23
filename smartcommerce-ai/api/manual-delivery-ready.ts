import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import { getManualDeliveryReview } from "../src/server/deliveryReviewQueue.js";
import { enforceDurableRateLimit, recordSecurityEvent, requestIp } from "../src/server/securityInfrastructure.js";

const COOKIE_NAME = "sc_session";
const MAX_BODY_BYTES = 8_000;
let sqlClient: ReturnType<typeof neon> | undefined;

type QuoteRow = {
  id: string;
  customer_id: string;
  currency: string;
  subtotal_minor: number | string;
  tax_minor: number | string;
  service_minor: number | string;
  snapshot: any;
  expires_at: string | Date;
};

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("COMMERCE_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseCookie(header?: string) {
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

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function sameOrigin(request: any) {
  const origin = firstHeader(request.headers?.origin);
  if (!origin) return true;
  const host = firstHeader(request.headers?.host);
  if (!host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

async function currentCustomerId(request: any) {
  const token = parseCookie(firstHeader(request.headers?.cookie))[COOKIE_NAME];
  if (!token) return undefined;
  const rows = await sql()`
    SELECT customer_id
    FROM customer_sessions
    WHERE token_hash = ${hashToken(token)}
      AND revoked_at IS NULL
      AND expires_at > NOW()
    LIMIT 1
  ` as Array<{ customer_id: string }>;
  return rows[0]?.customer_id;
}

async function readJsonBody<T>(request: AsyncIterable<unknown>): Promise<T> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    if (chunk == null) continue;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    total += buffer.length;
    if (total > MAX_BODY_BYTES) throw Object.assign(new Error("REQUEST_TOO_LARGE"), { status: 413 });
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as T;
}

function snapshotObject(value: any) {
  if (!value) return {};
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return {}; }
  }
  return value;
}

function canonicalItems(items: any[]) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({ productId: String(item?.productId || "").trim(), quantity: Math.max(1, Math.floor(Number(item?.quantity || 1))) }))
    .filter((item) => item.productId)
    .sort((a, b) => a.productId.localeCompare(b.productId) || a.quantity - b.quantity);
}

function sameItems(left: any[], right: any[]) {
  return JSON.stringify(canonicalItems(left)) === JSON.stringify(canonicalItems(right));
}

function send(response: any, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");
  response.end(JSON.stringify(payload));
}

async function freshQuote(quoteId: string, customerId: string) {
  const rows = await sql()`
    SELECT id, customer_id, currency, subtotal_minor, tax_minor, service_minor, snapshot, expires_at
    FROM checkout_quotes
    WHERE id = ${quoteId} AND customer_id = ${customerId}
    LIMIT 1
  ` as QuoteRow[];
  return rows[0];
}

export default async function handler(request: any, response: any) {
  const method = String(request.method || "GET").toUpperCase();
  if (!sameOrigin(request)) return send(response, 403, { error: { code: "ORIGIN_REJECTED", message: "This request was rejected." } });

  try {
    const customerId = await currentCustomerId(request);
    if (!customerId) return send(response, 401, { error: { code: "AUTH_REQUIRED", message: "Sign in to use a reviewed delivery price." } });
    await enforceDurableRateLimit({ request, action: "manual_delivery_ready_customer", subject: customerId, limit: 40, windowSeconds: 600 });
    await enforceDurableRateLimit({ request, action: "manual_delivery_ready_ip", subject: requestIp(request), limit: 100, windowSeconds: 600 });

    if (method === "GET") {
      const url = new URL(request.url || "/api/manual-delivery-ready", "https://smartcommerce.internal");
      const quoteId = String(url.searchParams.get("quoteId") || "").trim().slice(0, 80);
      if (!quoteId) return send(response, 400, { error: { code: "CHECKOUT_QUOTE_REQUIRED", message: "A fresh checkout quote is required." } });
      const quote = await freshQuote(quoteId, customerId);
      if (!quote || new Date(quote.expires_at).getTime() <= Date.now()) return send(response, 409, { error: { code: "CHECKOUT_QUOTE_NOT_FRESH", message: "Refresh checkout before using a reviewed delivery price." } });
      const snapshot = snapshotObject(quote.snapshot);
      const quoteItems = Array.isArray(snapshot?.items) ? snapshot.items : [];
      const candidates = await sql()`
        SELECT id, quote_id, status, reason_code, provider_name, vehicle_class,
               provider_cost_minor, operations_markup_minor, customer_charge_minor,
               currency, scheduled_for, staff_notes, address, items, reviewed_at
        FROM delivery_manual_reviews
        WHERE customer_id = ${customerId} AND status = 'priced'
        ORDER BY reviewed_at DESC NULLS LAST, created_at DESC
        LIMIT 25
      ` as any[];
      const matches = candidates.filter((review) => sameItems(quoteItems, Array.isArray(review.items) ? review.items : [])).map((review) => ({
        id: review.id,
        providerName: review.provider_name,
        vehicleClass: review.vehicle_class,
        providerCostMinor: Number(review.provider_cost_minor || 0),
        operationsMarkupMinor: Number(review.operations_markup_minor || 0),
        customerChargeMinor: Number(review.customer_charge_minor || 0),
        currency: String(review.currency || "JMD"),
        scheduledFor: review.scheduled_for,
        staffNotes: review.staff_notes,
        address: review.address,
        reviewedAt: review.reviewed_at,
      }));
      return send(response, 200, { reviews: matches });
    }

    if (method !== "POST") {
      response.setHeader("Allow", "GET, POST");
      return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "GET or POST is required." } });
    }

    const input = await readJsonBody<{ quoteId?: string; reviewId?: string }>(request);
    const quoteId = String(input.quoteId || "").trim().slice(0, 80);
    const reviewId = String(input.reviewId || "").trim().slice(0, 80);
    if (!quoteId || !reviewId) return send(response, 400, { error: { code: "MANUAL_DELIVERY_BINDING_REQUIRED", message: "Choose a reviewed delivery price on a fresh checkout quote." } });

    const quote = await freshQuote(quoteId, customerId);
    if (!quote) return send(response, 404, { error: { code: "CHECKOUT_QUOTE_NOT_FOUND", message: "Refresh checkout and try again." } });
    if (new Date(quote.expires_at).getTime() <= Date.now()) return send(response, 409, { error: { code: "CHECKOUT_QUOTE_EXPIRED", message: "Your merchandise quote expired. Refresh checkout before attaching delivery." } });

    const review = await getManualDeliveryReview(reviewId);
    if (!review || String(review.customer_id) !== customerId) return send(response, 404, { error: { code: "DELIVERY_REVIEW_NOT_FOUND", message: "That reviewed delivery price is not available for this account." } });
    if (review.status !== "priced" || Number(review.customer_charge_minor || 0) <= 0) return send(response, 409, { error: { code: "DELIVERY_REVIEW_NOT_PRICED", message: "That manual delivery review is not ready to attach." } });
    if (String(review.currency || "JMD").toUpperCase() !== String(quote.currency || "JMD").toUpperCase()) return send(response, 409, { error: { code: "DELIVERY_REVIEW_CURRENCY_CHANGED", message: "The reviewed delivery currency no longer matches checkout." } });

    const snapshot = snapshotObject(quote.snapshot);
    const quoteItems = Array.isArray(snapshot?.items) ? snapshot.items : [];
    const reviewItems = Array.isArray(review.items) ? review.items : [];
    if (!sameItems(quoteItems, reviewItems)) return send(response, 409, { error: { code: "DELIVERY_REVIEW_CART_CHANGED", message: "Your cart changed after delivery was reviewed. Submit the current shipment for a new logistics review." } });

    const deliveryMinor = Number(review.customer_charge_minor || 0);
    const subtotalMinor = Number(quote.subtotal_minor || 0);
    const taxMinor = Number(quote.tax_minor || 0);
    const serviceMinor = Number(quote.service_minor || 0);
    const totalMinor = subtotalMinor + taxMinor + serviceMinor + deliveryMinor;
    const bound = {
      mode: "delivery",
      status: "bound",
      source: "manual_review",
      reviewId: review.id,
      provider: review.provider_name || "manual_logistics",
      serviceId: `manual:${review.id}`,
      serviceLabel: review.vehicle_class || review.provider_name || "Manually reviewed delivery",
      serviceMode: "manual_delivery",
      providerCostJmd: Number(review.provider_cost_minor || 0) / 100,
      operationsMarkupJmd: Number(review.operations_markup_minor || 0) / 100,
      customerChargeJmd: deliveryMinor / 100,
      address: review.address,
      scheduledFor: review.scheduled_for,
      staffNotes: review.staff_notes,
      reviewedBy: review.reviewed_by,
      reviewedAt: review.reviewed_at,
      boundAt: new Date().toISOString(),
    };
    const nextSnapshot = { ...snapshot, fulfilment: bound };

    await sql()`
      UPDATE checkout_quotes
      SET delivery_minor = ${deliveryMinor},
          total_minor = ${totalMinor},
          snapshot = ${JSON.stringify(nextSnapshot)}::jsonb
      WHERE id = ${quoteId} AND customer_id = ${customerId}
    `;
    await sql()`
      UPDATE delivery_manual_reviews
      SET status = 'attached', updated_at = NOW()
      WHERE id = ${reviewId} AND customer_id = ${customerId} AND status = 'priced'
    `;
    await recordSecurityEvent({ request, eventType: "manual_delivery_review_attached", eventStatus: "bound", riskLevel: "info", customerId, metadata: { quoteId, reviewId, deliveryMinor, totalMinor } });
    return send(response, 200, { fulfilment: bound, quote: { id: quoteId, deliveryMinor, totalMinor }, review: { id: reviewId, status: "attached" } });
  } catch (error: any) {
    if (error instanceof SyntaxError) return send(response, 400, { error: { code: "INVALID_JSON", message: "The request body is invalid." } });
    if (error?.message === "RATE_LIMITED") {
      const retryAfter = Math.max(1, Number(error?.retryAfterSeconds || 60));
      response.setHeader("Retry-After", String(retryAfter));
      return send(response, 429, { error: { code: "RATE_LIMITED", message: "Too many delivery-review requests. Please wait and try again.", retryAfterSeconds: retryAfter } });
    }
    if (Number(error?.status) === 413) return send(response, 413, { error: { code: "REQUEST_TOO_LARGE", message: "The request is too large." } });
    console.error("manual_delivery_ready_error", { code: error instanceof Error ? error.message : "unknown" });
    return send(response, 503, { error: { code: "MANUAL_DELIVERY_READY_UNAVAILABLE", message: "Reviewed delivery pricing could not be attached right now.", retryable: true } });
  }
}
