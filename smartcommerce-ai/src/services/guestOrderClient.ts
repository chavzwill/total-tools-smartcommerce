export type GuestOrder = {
  id: string;
  quoteId: string;
  paymentAttemptId: string;
  status: "paid";
  currency: string;
  totalMinor: number;
  provider: string;
  providerReference: string;
  paidAt: string;
  createdAt: string;
  items: Array<{ productId?: string; sku?: string | null; name?: string; quantity?: number; unitPrice?: number; currency?: string }>;
  fulfilment: any;
  pricing: any;
  payment: any;
};

type ErrorPayload = { error?: { code?: string; message?: string } };

async function parse(response: Response) {
  const payload = await response.json().catch(() => ({})) as { order?: GuestOrder; accessToken?: string; expiresAt?: string } & ErrorPayload;
  if (!response.ok) {
    const error = new Error(payload.error?.message || "Guest order could not be loaded.") as Error & { code?: string; status?: number };
    error.code = payload.error?.code;
    error.status = response.status;
    throw error;
  }
  return payload;
}

export async function getGuestOrder(input: { orderId?: string; attemptId?: string }) {
  const params = new URLSearchParams();
  if (input.orderId) params.set("orderId", input.orderId);
  if (input.attemptId) params.set("attemptId", input.attemptId);
  const response = await fetch(`/api/guest-order?${params.toString()}`, { credentials: "same-origin", headers: { Accept: "application/json" } });
  const payload = await parse(response);
  if (!payload.order) throw new Error("Guest order could not be loaded.");
  return payload.order;
}

export async function getGuestOrderWithAccessToken(input: { orderId: string; accessToken: string }) {
  const response = await fetch("/api/guest-order", {
    method: "POST",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ action: "retrieve_with_access_token", orderId: input.orderId, accessToken: input.accessToken }),
  });
  const payload = await parse(response);
  if (!payload.order) throw new Error("Guest order could not be loaded.");
  return payload.order;
}

export async function issueGuestReceiptLink(orderId: string) {
  const response = await fetch("/api/guest-order", {
    method: "POST",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ action: "issue_access_link", orderId }),
  });
  const payload = await parse(response);
  if (!payload.accessToken || !payload.expiresAt) throw new Error("Secure receipt link could not be created.");
  return { accessToken: payload.accessToken, expiresAt: payload.expiresAt };
}
