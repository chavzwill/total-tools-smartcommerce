import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import { quoteDelivery } from "../src/server/deliveryFulfilmentEngine.js";
import { resolveDeliveryItems } from "../src/server/deliveryProductFacts.js";
import { createManualDeliveryReview } from "../src/server/deliveryReviewQueue.js";
import { resolveJamaicaDeliveryZone } from "../src/server/jamaicaDeliveryZones.js";
import { enforceDurableRateLimit, recordSecurityEvent, requestIp } from "../src/server/securityInfrastructure.js";

const COOKIE_NAME = "sc_session";
const MAX_BODY_BYTES = 24_000;
const CUSTOMER_LIMIT = 30;
const IP_LIMIT = 80;
let sqlClient: ReturnType<typeof neon> | undefined;

type AddressInput = {
  label?: string;
  type?: "home" | "business" | "job_site";
  siteName?: string;
  recipientName?: string;
  phone?: string;
  line1?: string;
  line2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  countryCode?: string;
  notes?: string;
};

type BindInput = {
  quoteId?: string;
  mode?: "pickup" | "delivery";
  serviceId?: string;
  requestedSpeed?: "standard" | "same_day";
  address?: AddressInput;
};

type QuoteRow = {
  id: string;
  customer_id: string;
  currency: string;
  subtotal_minor: number | string;
  tax_minor: number | string;
  delivery_minor: number | string;
  service_minor: number | string;
  total_minor: number | string;
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
    if (total > MAX_BODY_BYTES) throw Object.assign(new Error("BODY_TOO_LARGE"), { status: 413 });
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as T;
}

function clean(value: unknown, max: number) {
  return String(value || "").trim().slice(0, max);
}

function normalizeAddress(raw?: AddressInput) {
  const address = {
    label: clean(raw?.label, 80),
    type: raw?.type === "business" || raw?.type === "job_site" ? raw.type : "home" as const,
    siteName: clean(raw?.siteName, 120),
    recipientName: clean(raw?.recipientName, 120),
    phone: clean(raw?.phone, 40),
    line1: clean(raw?.line1, 180),
    line2: clean(raw?.line2, 180),
    city: clean(raw?.city, 100),
    region: clean(raw?.region, 100),
    postalCode: clean(raw?.postalCode, 30),
    countryCode: clean(raw?.countryCode || "JM", 2).toUpperCase(),
    notes: clean(raw?.notes, 500),
  };
  if (!address.recipientName || !address.phone || !address.line1 || !address.city || !address.region || address.countryCode !== "JM") {
    throw Object.assign(new Error("DELIVERY_ADDRESS_INCOMPLETE"), { status: 400 });
  }
  return address;
}

function snapshotObject(value: any) {
  if (!value) return {} as any;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return {}; }
  }
  return value;
}

function send(response: any, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(payload));
}

export default async function handler(request: any, response: any) {
  if (String(request.method || "").toUpperCase() !== "POST") {
    response.setHeader("Allow", "POST");
    return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "POST is required." } });
  }
  if (!sameOrigin(request)) return send(response, 403, { error: { code: "ORIGIN_REJECTED", message: "This request was rejected." } });

  try {
    const customerId = await currentCustomerId(request);
    if (!customerId) return send(response, 401, { error: { code: "AUTH_REQUIRED", message: "Sign in to finalize delivery on this checkout quote." } });

    await enforceDurableRateLimit({ request, action: "checkout_fulfilment_customer", subject: customerId, limit: CUSTOMER_LIMIT, windowSeconds: 600 });
    await enforceDurableRateLimit({ request, action: "checkout_fulfilment_ip", subject: requestIp(request), limit: IP_LIMIT, windowSeconds: 600 });

    const input = await readJsonBody<BindInput>(request);
    const quoteId = clean(input.quoteId, 80);
    const mode = input.mode === "delivery" ? "delivery" : "pickup";
    if (!quoteId) return send(response, 400, { error: { code: "INVALID_CHECKOUT_QUOTE", message: "A verified checkout quote is required." } });

    const rows = await sql()`
      SELECT id, customer_id, currency, subtotal_minor, tax_minor, delivery_minor,
             service_minor, total_minor, snapshot, expires_at
      FROM checkout_quotes
      WHERE id = ${quoteId} AND customer_id = ${customerId}
      LIMIT 1
    ` as QuoteRow[];
    const quote = rows[0];
    if (!quote) return send(response, 404, { error: { code: "CHECKOUT_QUOTE_NOT_FOUND", message: "That checkout quote is no longer available. Refresh checkout and try again." } });
    if (new Date(quote.expires_at).getTime() <= Date.now()) return send(response, 409, { error: { code: "CHECKOUT_QUOTE_EXPIRED", message: "Your checkout quote expired. Refresh checkout to revalidate the order." } });

    const snapshot = snapshotObject(quote.snapshot);
    const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
    if (!items.length) return send(response, 409, { error: { code: "CHECKOUT_QUOTE_INVALID", message: "The checkout quote has no verified items." } });

    const subtotalMinor = Number(quote.subtotal_minor || 0);
    const taxMinor = Number(quote.tax_minor || 0);
    const serviceMinor = Number(quote.service_minor || 0);

    if (mode === "pickup") {
      const totalMinor = subtotalMinor + taxMinor + serviceMinor;
      const nextSnapshot = {
        ...snapshot,
        fulfilment: {
          mode: "pickup",
          status: "bound",
          deliveryMinor: 0,
          boundAt: new Date().toISOString(),
        },
      };
      await sql()`
        UPDATE checkout_quotes
        SET delivery_minor = 0,
            total_minor = ${totalMinor},
            snapshot = ${JSON.stringify(nextSnapshot)}::jsonb
        WHERE id = ${quoteId} AND customer_id = ${customerId}
      `;
      await recordSecurityEvent({ request, eventType: "checkout_fulfilment_bound", eventStatus: "pickup", riskLevel: "info", customerId, metadata: { quoteId, mode: "pickup", totalMinor } });
      return send(response, 200, { fulfilment: nextSnapshot.fulfilment, quote: { id: quoteId, deliveryMinor: 0, totalMinor } });
    }

    const address = normalizeAddress(input.address);
    const requestedSpeed = input.requestedSpeed === "same_day" ? "same_day" : "standard";
    const serviceId = clean(input.serviceId, 100);
    const zone = resolveJamaicaDeliveryZone({ town: address.city, parish: address.region });

    const resolvedItems = await resolveDeliveryItems(items.map((item: any) => ({
      productId: clean(item.productId, 180),
      quantity: Math.max(1, Math.min(999, Math.floor(Number(item.quantity || 1)))),
      fulfilmentType: "sale" as const,
    })));

    const delivery = zone.status === "resolved"
      ? quoteDelivery({
          items: resolvedItems,
          destinationCountryCode: address.countryCode,
          destinationClass: zone.destinationClass,
          requestedSpeed,
          sameDayEligible: zone.sameDayEligible,
        })
      : {
          status: "manual_review" as const,
          reasonCode: zone.reasonCode,
          message: zone.message,
          options: [] as [],
        };

    if (delivery.status === "manual_review") {
      const destinationClass = zone.status === "resolved" ? zone.destinationClass : undefined;
      const review = await createManualDeliveryReview({
        quoteId,
        customerId,
        reasonCode: delivery.reasonCode,
        reasonMessage: delivery.message,
        requestedServiceId: serviceId || undefined,
        requestedSpeed,
        destinationClass,
        address,
        items,
      });
      const manualReview = {
        mode: "delivery",
        status: "manual_review",
        reviewId: review.id,
        reasonCode: delivery.reasonCode,
        message: delivery.message,
        address,
        destinationClass: destinationClass || null,
        zone,
        requestedSpeed,
        requestedServiceId: serviceId || null,
        requestedAt: new Date().toISOString(),
      };
      const nextSnapshot = { ...snapshot, fulfilment: manualReview };
      await sql()`UPDATE checkout_quotes SET snapshot = ${JSON.stringify(nextSnapshot)}::jsonb WHERE id = ${quoteId} AND customer_id = ${customerId}`;
      await recordSecurityEvent({ request, eventType: "delivery_manual_review_requested", eventStatus: "pending", riskLevel: "info", customerId, metadata: { quoteId, reviewId: review.id, reasonCode: delivery.reasonCode, destinationClass: destinationClass || null, requestedSpeed } });
      return send(response, 202, { fulfilment: manualReview, zone, review: { id: review.id, status: review.status }, quote: { id: quoteId, deliveryMinor: Number(quote.delivery_minor || 0), totalMinor: Number(quote.total_minor || 0) } });
    }

    if (!serviceId) return send(response, 400, { error: { code: "DELIVERY_SERVICE_REQUIRED", message: "Choose a delivery service before finalizing delivery." } });
    const option = delivery.options.find((candidate) => candidate.serviceId === serviceId);
    if (!option) return send(response, 409, { error: { code: "DELIVERY_SERVICE_CHANGED", message: "That delivery option is no longer available. Refresh the courier choices and try again." } });

    if (option.mode !== "door_to_door") {
      return send(response, 409, { error: { code: "DELIVERY_COLLECTION_POINT_REQUIRED", message: "Choose a courier collection point before this service can be attached to the order." } });
    }

    const deliveryMinor = Math.round(option.customerChargeJmd * 100);
    const totalMinor = subtotalMinor + taxMinor + serviceMinor + deliveryMinor;
    const bound = {
      mode: "delivery",
      status: "bound",
      provider: option.provider,
      serviceId: option.serviceId,
      serviceLabel: option.label,
      serviceMode: option.mode,
      providerCostJmd: option.providerCostJmd,
      operationsMarkupRate: option.operationsMarkupRate,
      operationsMarkupJmd: option.operationsMarkupJmd,
      customerChargeJmd: option.customerChargeJmd,
      billableWeightLb: option.billableWeightLb,
      address,
      destinationClass: zone.destinationClass,
      zone,
      requestedSpeed,
      sourceStatus: option.sourceStatus,
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
    await recordSecurityEvent({ request, eventType: "checkout_fulfilment_bound", eventStatus: "delivery", riskLevel: "info", customerId, metadata: { quoteId, provider: option.provider, serviceId: option.serviceId, destinationClass: zone.destinationClass, deliveryMinor, totalMinor } });
    return send(response, 200, { fulfilment: bound, zone, quote: { id: quoteId, deliveryMinor, totalMinor } });
  } catch (error: any) {
    if (error instanceof SyntaxError) return send(response, 400, { error: { code: "INVALID_JSON", message: "The request body is invalid." } });
    if (error?.message === "RATE_LIMITED") {
      const retryAfter = Math.max(1, Number(error?.retryAfterSeconds || 60));
      response.setHeader("Retry-After", String(retryAfter));
      return send(response, 429, { error: { code: "RATE_LIMITED", message: "Too many fulfilment requests. Please wait and try again.", retryAfterSeconds: retryAfter } });
    }
    if (error?.message === "DELIVERY_ADDRESS_INCOMPLETE") return send(response, 400, { error: { code: "DELIVERY_ADDRESS_INCOMPLETE", message: "Add the recipient, phone, street address, city and parish/region before finalizing delivery." } });
    if (Number(error?.status) === 413) return send(response, 413, { error: { code: "REQUEST_TOO_LARGE", message: "The request is too large." } });
    console.error("checkout_fulfilment_error", { code: error instanceof Error ? error.message : "unknown" });
    return send(response, 503, { error: { code: "CHECKOUT_FULFILMENT_UNAVAILABLE", message: "Fulfilment could not be finalized right now. Your cart and checkout quote are unchanged.", retryable: true } });
  }
}
