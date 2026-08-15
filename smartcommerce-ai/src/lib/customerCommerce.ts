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
};

type CommerceError = Error & { code?: string; status?: number };

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
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || "Commerce request failed.") as CommerceError;
    error.code = payload?.error?.code;
    error.status = response.status;
    throw error;
  }
  return payload as T;
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
  return result.quote;
}
