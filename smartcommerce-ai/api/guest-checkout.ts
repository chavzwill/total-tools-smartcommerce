import { createHash } from "node:crypto";
import { handlePlatformRestRequest } from "../src/backend/platformRestApi.js";
import { createConfiguredTotalToolsPlatformService } from "../src/integrations/totalToolsPlatformRuntime.js";
import { enforceDurableRateLimit, recordSecurityEvent, requestIp } from "../src/server/securityInfrastructure.js";
import {
  GUEST_CHECKOUT_COOKIE,
  getOrCreateGuestSession,
  guestCheckoutCookie,
  parseCookie,
  persistGuestQuote,
} from "../src/server/guestCheckoutIdentity.js";

const MAX_BODY_BYTES = 24_000;
const QUOTE_TTL_MS = 10 * 60 * 1000;
const GUEST_QUOTE_IP_LIMIT = 30;
const MAX_ITEMS = 80;
const platformService = createConfiguredTotalToolsPlatformService();

type GuestItemInput = { productId?: string; quantity?: number };
type ProductPricing = {
  currency?: string;
  listPrice?: number;
  salePrice?: number;
  taxInclusive?: boolean;
  taxRate?: number;
};
type ProviderProduct = {
  id: string;
  name?: string;
  sku?: string;
  brand?: string;
  purchasable?: boolean;
  active?: boolean;
  pricing?: ProductPricing[];
};

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function sameOrigin(request: any) {
  const origin = firstHeader(request.headers?.origin);
  if (!origin) return true;
  const host = firstHeader(request.headers?.host);
  if (!host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function readJsonBody<T>(request: AsyncIterable<unknown>): Promise<T> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    if (chunk === undefined || chunk === null) continue;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    total += buffer.length;
    if (total > MAX_BODY_BYTES) throw Object.assign(new Error("BODY_TOO_LARGE"), { status: 413 });
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as T;
}

function trustedPlatformHeaders() {
  const headers = new Headers({ Accept: "application/json" });
  const businessAccountId = process.env.SMARTCOMMERCE_BUSINESS_ACCOUNT_ID?.trim();
  const providerId = process.env.SMARTCOMMERCE_PROVIDER_ID?.trim();
  if (businessAccountId) headers.set("x-business-account-id", businessAccountId);
  if (providerId) headers.set("x-provider-id", providerId);
  return headers;
}

async function fetchProduct(productId: string): Promise<ProviderProduct | undefined> {
  const platformRequest = new Request(
    `https://smartcommerce.internal/api/platform/products/${encodeURIComponent(productId)}`,
    { method: "GET", headers: trustedPlatformHeaders() },
  );
  const response = await handlePlatformRestRequest(platformRequest, platformService);
  if (!response.ok) return undefined;
  const payload = await response.json().catch(() => undefined) as any;
  if (!payload?.success || !payload.data) return undefined;
  return payload.data as ProviderProduct;
}

function retailPrice(product: ProviderProduct) {
  const pricing = Array.isArray(product.pricing) ? product.pricing : [];
  const selected = pricing.find((entry) => Number.isFinite(entry.salePrice)) || pricing.find((entry) => Number.isFinite(entry.listPrice));
  const amount = selected?.salePrice ?? selected?.listPrice;
  if (!selected || !Number.isFinite(amount) || Number(amount) < 0) return undefined;
  return {
    amount: Number(amount),
    currency: String(selected.currency || "JMD").toUpperCase(),
    taxInclusive: Boolean(selected.taxInclusive),
    taxRate: Number.isFinite(selected.taxRate) ? Number(selected.taxRate) : undefined,
  };
}

function normalizeItems(rawItems: GuestItemInput[]) {
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > MAX_ITEMS) {
    throw Object.assign(new Error("INVALID_GUEST_CART"), { status: 400 });
  }
  const combined = new Map<string, number>();
  for (const item of rawItems) {
    const productId = String(item?.productId || "").trim();
    const quantity = Number(item?.quantity);
    if (!productId || productId.length > 180 || !Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      throw Object.assign(new Error("INVALID_GUEST_CART"), { status: 400 });
    }
    combined.set(productId, Math.min(999, (combined.get(productId) || 0) + quantity));
  }
  return [...combined.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

function send(response: any, status: number, payload: unknown) {
  response.statusCode = status;
  response.end(JSON.stringify(payload));
}

export default async function handler(request: any, response: any) {
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");

  try {
    if (String(request.method || "").toUpperCase() !== "POST") {
      response.setHeader("Allow", "POST");
      return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "POST is required." } });
    }
    if (!sameOrigin(request)) return send(response, 403, { error: { code: "ORIGIN_REJECTED", message: "This request was rejected." } });

    await enforceDurableRateLimit({
      request,
      action: "commerce_guest_quote_ip",
      subject: requestIp(request),
      limit: GUEST_QUOTE_IP_LIMIT,
      windowSeconds: 600,
    });

    const cookies = parseCookie(firstHeader(request.headers?.cookie));
    const guestSession = await getOrCreateGuestSession(cookies[GUEST_CHECKOUT_COOKIE]);
    if (guestSession.created) {
      const forwardedProto = firstHeader(request.headers?.["x-forwarded-proto"]);
      response.setHeader("Set-Cookie", guestCheckoutCookie(guestSession.token, forwardedProto !== "http"));
    }

    const input = await readJsonBody<{ items?: GuestItemInput[] }>(request);
    const items = normalizeItems(input.items || []);
    const snapshotItems: Array<{ productId: string; sku?: string | null; name: string; quantity: number; unitPrice: number; currency: string }> = [];
    let subtotal = 0;
    let taxMinor = 0;
    let currency: string | undefined;

    for (const item of items) {
      const product = await fetchProduct(item.productId);
      const price = product ? retailPrice(product) : undefined;
      if (!product || product.active === false || product.purchasable === false || !price) {
        throw Object.assign(new Error("ITEM_REVALIDATION_FAILED"), { status: 409 });
      }
      if (currency && currency !== price.currency) throw Object.assign(new Error("MIXED_CURRENCY_CART"), { status: 409 });
      currency = price.currency;
      const line = price.amount * item.quantity;
      subtotal += line;
      if (!price.taxInclusive && price.taxRate && price.taxRate > 0) taxMinor += Math.round(line * price.taxRate * 100);
      snapshotItems.push({
        productId: product.id,
        sku: product.sku || null,
        name: product.name || product.id,
        quantity: item.quantity,
        unitPrice: price.amount,
        currency: price.currency,
      });
    }

    const subtotalMinor = Math.round(subtotal * 100);
    const totalMinor = subtotalMinor + taxMinor;
    const quoteBucket = Math.floor(Date.now() / QUOTE_TTL_MS);
    const fingerprint = stableHash({ kind: "guest", guestSessionId: guestSession.id, quoteBucket, snapshotItems, subtotalMinor, taxMinor, totalMinor });
    const quote = {
      id: `gqte_${fingerprint.slice(0, 32)}`,
      currency: currency || "JMD",
      subtotalMinor,
      taxMinor,
      deliveryMinor: 0,
      serviceMinor: 0,
      totalMinor,
      expiresAt: new Date((quoteBucket + 1) * QUOTE_TTL_MS).toISOString(),
      items: snapshotItems,
      paymentAvailable: false,
      checkoutMode: "guest" as const,
    };

    await persistGuestQuote({
      id: quote.id,
      guestSessionId: guestSession.id,
      currency: quote.currency,
      subtotalMinor: quote.subtotalMinor,
      taxMinor: quote.taxMinor,
      deliveryMinor: quote.deliveryMinor,
      serviceMinor: quote.serviceMinor,
      totalMinor: quote.totalMinor,
      snapshot: { items: snapshotItems, revalidatedAt: new Date().toISOString(), quoteFingerprint: fingerprint },
      expiresAt: quote.expiresAt,
    });

    await recordSecurityEvent({
      request,
      eventType: "commerce_guest_quote_created",
      eventStatus: "created_or_replayed",
      riskLevel: "info",
      customerId: null,
      metadata: { quoteId: quote.id, guestSessionId: guestSession.id, itemCount: snapshotItems.length, totalMinor, currency: quote.currency },
    });

    return send(response, 201, { quote });
  } catch (error) {
    if (error instanceof SyntaxError) return send(response, 400, { error: { code: "INVALID_JSON", message: "The request body is invalid." } });
    const status = Number((error as any)?.status || 500);
    const code = error instanceof Error ? error.message : "GUEST_CHECKOUT_FAILED";
    if (code === "RATE_LIMITED") {
      const retryAfter = Math.max(1, Number((error as any)?.retryAfterSeconds || 60));
      response.setHeader("Retry-After", String(retryAfter));
      return send(response, 429, { error: { code: "RATE_LIMITED", message: "Too many checkout requests. Please wait and try again.", retryAfterSeconds: retryAfter } });
    }
    if (code === "INVALID_GUEST_CART") return send(response, 400, { error: { code, message: "Your guest cart contains an invalid item or quantity." } });
    if (code === "ITEM_REVALIDATION_FAILED") return send(response, 409, { error: { code, message: "One or more items could not be revalidated against live provider data." } });
    if (code === "MIXED_CURRENCY_CART") return send(response, 409, { error: { code, message: "The current cart contains incompatible currencies." } });
    if (status === 413) return send(response, 413, { error: { code: "REQUEST_TOO_LARGE", message: "The request is too large." } });
    console.error("guest_checkout_api_error", { code: "guest_checkout_failed" });
    return send(response, 503, { error: { code: "GUEST_CHECKOUT_UNAVAILABLE", message: "Guest checkout is temporarily unavailable.", retryable: true } });
  }
}
