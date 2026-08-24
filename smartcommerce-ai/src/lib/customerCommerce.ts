export type CommerceCartItem = {
  id: string;
  type: "product" | "rental";
  providerItemId: string;
  quantity: number;
  validation: "verified" | "unavailable" | "unsupported";
  product?: {
    id: string;
    name: string;
    sku?: string;
    brand?: string;
    unitPrice?: number;
    currency?: string;
  };
};

export type CommerceCart = {
  id: string;
  currency: string;
  items: CommerceCartItem[];
};

export type GuestCheckoutItem = {
  productId: string;
  quantity: number;
};

export type CheckoutQuote = {
  id: string;
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  deliveryMinor: number;
  serviceMinor: number;
  totalMinor: number;
  expiresAt: string;
  items: Array<{
    productId: string;
    sku?: string | null;
    name: string;
    quantity: number;
    unitPrice: number;
    currency: string;
  }>;
  paymentAvailable: boolean;
  checkoutMode?: "account" | "guest";
};

type CommerceError = Error & { code?: string; status?: number };

const VERIFIED_QUOTE_ID_KEY = "smartcommerce_verified_quote_id";
const VERIFIED_QUOTE_MODE_KEY = "smartcommerce_verified_quote_mode";

function rememberVerifiedQuote(quote: CheckoutQuote, mode: "account" | "guest") {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(VERIFIED_QUOTE_ID_KEY, quote.id);
  window.sessionStorage.setItem(VERIFIED_QUOTE_MODE_KEY, mode);
}

export function currentVerifiedQuoteContext() {
  if (typeof window === "undefined") return { quoteId: "", mode: undefined as "account" | "guest" | undefined };
  const quoteId = window.sessionStorage.getItem(VERIFIED_QUOTE_ID_KEY) || "";
  const rawMode = window.sessionStorage.getItem(VERIFIED_QUOTE_MODE_KEY);
  const mode = rawMode === "account" || rawMode === "guest" ? rawMode : undefined;
  return { quoteId, mode };
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || "Commerce request failed.") as CommerceError;
    error.code = payload?.error?.code;
    error.status = response.status;
    throw error;
  }
  return payload as T;
}

async function request<T>(method: "GET" | "POST", body?: unknown): Promise<T> {
  const response = await fetch("/api/commerce", {
    method,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parseResponse<T>(response);
}

export async function getPersistentCart() {
  const result = await request<{ cart: CommerceCart }>("GET");
  return result.cart;
}

export async function addPersistentCartItem(providerItemId: string, quantity = 1) {
  const result = await request<{ cart: CommerceCart }>("POST", {
    action: "add_item",
    itemType: "product",
    providerItemId,
    quantity,
  });
  return result.cart;
}

export async function setPersistentCartQuantity(itemId: string, quantity: number) {
  const result = await request<{ cart: CommerceCart }>("POST", {
    action: "set_quantity",
    itemId,
    quantity,
  });
  return result.cart;
}

export async function removePersistentCartItem(itemId: string) {
  const result = await request<{ cart: CommerceCart }>("POST", {
    action: "remove_item",
    itemId,
  });
  return result.cart;
}

export async function createCheckoutQuote() {
  const result = await request<{ quote: CheckoutQuote }>("POST", { action: "create_quote" });
  const quote = { ...result.quote, checkoutMode: result.quote.checkoutMode || "account" as const };
  rememberVerifiedQuote(quote, "account");
  return quote;
}

export async function createGuestCheckoutQuote(items: GuestCheckoutItem[]) {
  const response = await fetch("/api/guest-checkout", {
    method: "POST",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  const result = await parseResponse<{ quote: CheckoutQuote }>(response);
  const quote = { ...result.quote, checkoutMode: "guest" as const };
  rememberVerifiedQuote(quote, "guest");
  return quote;
}
