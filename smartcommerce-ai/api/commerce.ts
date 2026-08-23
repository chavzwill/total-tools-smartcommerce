import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";
import { handlePlatformRestRequest } from "../src/backend/platformRestApi.js";
import { createConfiguredTotalToolsPlatformService } from "../src/integrations/totalToolsPlatformRuntime.js";
import { validateCustomerCartInventory } from "../src/server/authoritativeCartInventory.js";
import {
  enforceDurableRateLimit,
  recordSecurityEvent,
  requestIp,
} from "../src/server/securityInfrastructure.js";

const COOKIE_NAME = "sc_session";
const MAX_BODY_BYTES = 24_000;
const QUOTE_TTL_MS = 10 * 60 * 1000;
const CART_MUTATION_LIMIT = 120;
const QUOTE_CUSTOMER_LIMIT = 12;
const QUOTE_IP_LIMIT = 40;
const platformService = createConfiguredTotalToolsPlatformService();
let sqlClient: ReturnType<typeof neon> | undefined;

type CartItemRow = {
  id: string;
  item_type: "product" | "rental";
  provider_id: string | null;
  provider_item_id: string;
  quantity: number;
};

type ProductPricing = {
  currency?: string;
  listPrice?: number;
  salePrice?: number;
  commercialPrice?: number;
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

type CartViewItem = {
  id: string;
  type: "product" | "rental";
  providerItemId: string;
  quantity: number;
  product?: {
    id: string;
    name: string;
    sku?: string;
    brand?: string;
    unitPrice?: number;
    currency?: string;
  };
  validation: "verified" | "unavailable" | "unsupported";
};

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("COMMERCE_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
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

function sameOrigin(request: any) {
  const origin = firstHeader(request.headers?.origin);
  if (!origin) return true;
  const host = firstHeader(request.headers?.host);
  if (!host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
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

async function currentCustomerId(request: any) {
  const token = parseCookie(firstHeader(request.headers?.cookie))[COOKIE_NAME];
  if (!token) return undefined;
  const db = sql();
  const rows = await db`
    SELECT customer_id
    FROM customer_sessions
    WHERE token_hash = ${hashToken(token)}
      AND revoked_at IS NULL
      AND expires_at > NOW()
    LIMIT 1
  ` as Array<{ customer_id: string }>;
  return rows[0]?.customer_id;
}

async function activeCart(customerId: string, create = true) {
  const db = sql();
  const existing = await db`
    SELECT id, currency
    FROM customer_carts
    WHERE customer_id = ${customerId} AND status = 'active'
    ORDER BY updated_at DESC
    LIMIT 1
  ` as Array<{ id: string; currency: string }>;
  if (existing[0] || !create) return existing[0];

  const id = `cart_${randomBytes(16).toString("hex")}`;
  const rows = await db`
    INSERT INTO customer_carts (id, customer_id, status, currency)
    VALUES (${id}, ${customerId}, 'active', 'JMD')
    RETURNING id, currency
  ` as Array<{ id: string; currency: string }>;
  return rows[0];
}

async function cartRows(cartId: string) {
  return await sql()`
    SELECT id, item_type, provider_id, provider_item_id, quantity
    FROM customer_cart_items
    WHERE cart_id = ${cartId}
    ORDER BY created_at ASC
  ` as CartItemRow[];
}

function trustedPlatformHeaders() {
  const headers = new Headers({ Accept: "application/json" });
  const businessAccountId = process.env.SMARTCOMMERCE_BUSINESS_ACCOUNT_ID?.trim();
  const providerId = process.env.SMARTCOMMERCE_PROVIDER_ID?.trim();
  if (businessAccountId) headers.set("x-business-account-id", businessAccountId);
  if (providerId) headers.set("x-provider-id", providerId);
  return headers;
}

async function fetchProduct(_request: any, productId: string): Promise<ProviderProduct | undefined> {
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

async function cartView(request: any, cartId: string) {
  const rows = await cartRows(cartId);
  const items: CartViewItem[] = await Promise.all(rows.map(async (row) => {
    if (row.item_type !== "product") {
      return { id: row.id, type: row.item_type, providerItemId: row.provider_item_id, quantity: row.quantity, validation: "unsupported" as const };
    }
    const product = await fetchProduct(request, row.provider_item_id);
    const price = product ? retailPrice(product) : undefined;
    if (!product || product.active === false || product.purchasable === false || !price) {
      return { id: row.id, type: row.item_type, providerItemId: row.provider_item_id, quantity: row.quantity, validation: "unavailable" as const };
    }
    return {
      id: row.id,
      type: row.item_type,
      providerItemId: row.provider_item_id,
      quantity: row.quantity,
      validation: "verified" as const,
      product: {
        id: product.id,
        name: product.name || product.id,
        sku: product.sku,
        brand: product.brand,
        unitPrice: price.amount,
        currency: price.currency,
      },
    };
  }));
  return items;
}

async function createQuote(request: any, customerId: string, cartId: string) {
  const rows = await cartRows(cartId);
  if (!rows.length) throw Object.assign(new Error("CART_EMPTY"), { status: 400 });
  if (rows.some((row) => row.item_type !== "product")) throw Object.assign(new Error("RENTAL_CHECKOUT_NOT_READY"), { status: 409 });

  const inventory = await validateCustomerCartInventory(customerId);
  if (!inventory.verified) {
    const error = Object.assign(new Error("STOCK_REVALIDATION_FAILED"), { status: 409, inventory });
    throw error;
  }

  const snapshotItems: any[] = [];
  let subtotal = 0;
  let currency: string | undefined;
  let taxMinor = 0;

  for (const row of rows) {
    const product = await fetchProduct(request, row.provider_item_id);
    const price = product ? retailPrice(product) : undefined;
    if (!product || product.active === false || product.purchasable === false || !price) {
      throw Object.assign(new Error("ITEM_REVALIDATION_FAILED"), { status: 409 });
    }
    if (currency && currency !== price.currency) throw Object.assign(new Error("MIXED_CURRENCY_CART"), { status: 409 });
    currency = price.currency;
    const line = price.amount * row.quantity;
    subtotal += line;
    if (!price.taxInclusive && price.taxRate && price.taxRate > 0) taxMinor += Math.round(line * price.taxRate * 100);
    const stock = inventory.lines.find((entry) => entry.productId === product.id);
    snapshotItems.push({
      productId: product.id,
      sku: product.sku || null,
      name: product.name || product.id,
      quantity: row.quantity,
      unitPrice: price.amount,
      currency: price.currency,
      inventory: stock ? {
        branchId: stock.branchId,
        quantityAvailable: stock.quantityAvailable,
        quantityOnHand: stock.quantityOnHand,
        checkedAt: inventory.checkedAt,
      } : null,
    });
  }

  const subtotalMinor = Math.round(subtotal * 100);
  const totalMinor = subtotalMinor + taxMinor;
  const quoteBucket = Math.floor(Date.now() / QUOTE_TTL_MS);
  const quoteFingerprint = stableHash({ customerId, cartId, quoteBucket, snapshotItems, subtotalMinor, taxMinor, totalMinor });
  const id = `qte_${quoteFingerprint.slice(0, 32)}`;
  const expiresAt = new Date((quoteBucket + 1) * QUOTE_TTL_MS).toISOString();
  const snapshot = JSON.stringify({
    items: snapshotItems,
    inventory: {
      verified: true,
      branchId: inventory.branchId,
      branchConfigured: inventory.branchConfigured,
      checkedAt: inventory.checkedAt,
    },
    revalidatedAt: new Date().toISOString(),
    quoteFingerprint,
  });
  await sql()`
    INSERT INTO checkout_quotes (
      id, customer_id, cart_id, currency, subtotal_minor, tax_minor, delivery_minor,
      service_minor, total_minor, pricing_source, snapshot, expires_at
    ) VALUES (
      ${id}, ${customerId}, ${cartId}, ${currency || "JMD"}, ${subtotalMinor}, ${taxMinor}, 0,
      0, ${totalMinor}, 'provider_inventory_revalidated', ${snapshot}::jsonb, ${expiresAt}
    )
    ON CONFLICT (id) DO NOTHING
  `;
  return { id, currency: currency || "JMD", subtotalMinor, taxMinor, deliveryMinor: 0, serviceMinor: 0, totalMinor, expiresAt, items: snapshotItems, paymentAvailable: false, inventory: { verified: true, branchId: inventory.branchId, checkedAt: inventory.checkedAt } };
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
  const method = String(request.method || "GET").toUpperCase();
  let customerIdForAudit: string | undefined;

  try {
    const customerId = await currentCustomerId(request);
    customerIdForAudit = customerId;
    if (!customerId) return send(response, 401, { error: { code: "AUTH_REQUIRED", message: "Sign in to use your persistent cart." } });

    const cart = await activeCart(customerId, true);
    if (!cart) throw new Error("CART_NOT_AVAILABLE");

    if (method === "GET") {
      const items = await cartView(request, cart.id);
      return send(response, 200, { cart: { id: cart.id, currency: cart.currency, items } });
    }

    if (method !== "POST") {
      response.setHeader("Allow", "GET, POST");
      return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "GET or POST is required." } });
    }
    if (!sameOrigin(request)) return send(response, 403, { error: { code: "ORIGIN_REJECTED", message: "This request was rejected." } });

    const input = await readJsonBody<{ action?: string; itemType?: string; providerItemId?: string; providerId?: string; quantity?: number; itemId?: string }>(request);
    const action = String(input.action || "");

    if (["add_item", "set_quantity", "remove_item"].includes(action)) {
      await enforceDurableRateLimit({ request, action: "commerce_cart_mutation", subject: customerId, limit: CART_MUTATION_LIMIT, windowSeconds: 300 });
    }

    if (action === "add_item") {
      const itemType = input.itemType === "rental" ? "rental" : "product";
      const providerItemId = String(input.providerItemId || "").trim();
      const quantity = Math.max(1, Math.min(999, Number(input.quantity || 1)));
      if (!providerItemId || providerItemId.length > 180 || !Number.isInteger(quantity)) return send(response, 400, { error: { code: "INVALID_CART_ITEM", message: "That item cannot be added to the cart." } });
      const id = `cit_${randomBytes(16).toString("hex")}`;
      const trustedProviderId = process.env.SMARTCOMMERCE_PROVIDER_ID?.trim() || null;
      await sql()`
        INSERT INTO customer_cart_items (id, cart_id, item_type, provider_id, provider_item_id, quantity)
        VALUES (${id}, ${cart.id}, ${itemType}, ${trustedProviderId}, ${providerItemId}, ${quantity})
        ON CONFLICT (cart_id, item_type, provider_item_id)
        DO UPDATE SET quantity = LEAST(999, customer_cart_items.quantity + EXCLUDED.quantity), updated_at = NOW()
      `;
      await sql()`UPDATE customer_carts SET updated_at = NOW() WHERE id = ${cart.id}`;
      return send(response, 200, { cart: { id: cart.id, currency: cart.currency, items: await cartView(request, cart.id) } });
    }

    if (action === "set_quantity") {
      const itemId = String(input.itemId || "");
      const quantity = Number(input.quantity);
      if (!itemId || !Number.isInteger(quantity) || quantity < 0 || quantity > 999) return send(response, 400, { error: { code: "INVALID_QUANTITY", message: "Use a valid quantity." } });
      if (quantity === 0) await sql()`DELETE FROM customer_cart_items WHERE id = ${itemId} AND cart_id = ${cart.id}`;
      else await sql()`UPDATE customer_cart_items SET quantity = ${quantity}, updated_at = NOW() WHERE id = ${itemId} AND cart_id = ${cart.id}`;
      await sql()`UPDATE customer_carts SET updated_at = NOW() WHERE id = ${cart.id}`;
      return send(response, 200, { cart: { id: cart.id, currency: cart.currency, items: await cartView(request, cart.id) } });
    }

    if (action === "remove_item") {
      const itemId = String(input.itemId || "");
      await sql()`DELETE FROM customer_cart_items WHERE id = ${itemId} AND cart_id = ${cart.id}`;
      await sql()`UPDATE customer_carts SET updated_at = NOW() WHERE id = ${cart.id}`;
      return send(response, 200, { cart: { id: cart.id, currency: cart.currency, items: await cartView(request, cart.id) } });
    }

    if (action === "create_quote") {
      await enforceDurableRateLimit({ request, action: "commerce_quote_customer", subject: customerId, limit: QUOTE_CUSTOMER_LIMIT, windowSeconds: 600 });
      await enforceDurableRateLimit({ request, action: "commerce_quote_ip", subject: requestIp(request), limit: QUOTE_IP_LIMIT, windowSeconds: 600 });
      const quote = await createQuote(request, customerId, cart.id);
      await recordSecurityEvent({ request, eventType: "commerce_quote_created", eventStatus: "created_or_replayed", riskLevel: "info", customerId, metadata: { quoteId: quote.id, cartId: cart.id, totalMinor: quote.totalMinor, currency: quote.currency, inventoryVerified: true, inventoryBranchId: quote.inventory.branchId } });
      return send(response, 201, { quote });
    }

    return send(response, 400, { error: { code: "INVALID_ACTION", message: "That commerce action is not supported." } });
  } catch (error) {
    if (error instanceof SyntaxError) return send(response, 400, { error: { code: "INVALID_JSON", message: "The request body is invalid." } });
    const status = Number((error as any)?.status || 500);
    const code = error instanceof Error ? error.message : "COMMERCE_REQUEST_FAILED";
    if (code === "RATE_LIMITED") {
      const retryAfter = Math.max(1, Number((error as any)?.retryAfterSeconds || 60));
      response.setHeader("Retry-After", String(retryAfter));
      try {
        await recordSecurityEvent({ request, eventType: "commerce_velocity_blocked", eventStatus: "rate_limited", riskLevel: "medium", customerId: customerIdForAudit || null, metadata: { retryAfterSeconds: retryAfter } });
      } catch {}
      return send(response, 429, { error: { code: "RATE_LIMITED", message: "Too many commerce requests. Please wait and try again.", retryAfterSeconds: retryAfter } });
    }
    const publicErrors: Record<string, string> = {
      CART_EMPTY: "Your cart is empty.",
      RENTAL_CHECKOUT_NOT_READY: "Rental checkout requires rental verification before payment.",
      ITEM_REVALIDATION_FAILED: "One or more items could not be revalidated against live provider data.",
      STOCK_REVALIDATION_FAILED: "One or more requested quantities could not be confirmed against live inventory. Review your cart or try again.",
      MIXED_CURRENCY_CART: "The current cart contains incompatible currencies.",
    };
    if (publicErrors[code]) return send(response, status, { error: { code, message: publicErrors[code] } });
    if (status === 413) return send(response, 413, { error: { code: "REQUEST_TOO_LARGE", message: "The request is too large." } });
    console.error("commerce_api_error", { code: code === "COMMERCE_DATABASE_NOT_CONFIGURED" ? "database_not_configured" : "commerce_request_failed" });
    return send(response, 503, { error: { code: "COMMERCE_UNAVAILABLE", message: "Cart and checkout are temporarily unavailable.", retryable: true } });
  }
}
