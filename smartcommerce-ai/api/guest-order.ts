import {
  GUEST_CHECKOUT_COOKIE,
  guestSessionFromToken,
  parseCookie,
} from "../src/server/guestCheckoutIdentity.js";
import {
  finalizeGuestOrderForConfirmedAttempt,
  getGuestOrderByAccessToken,
  getGuestOrderForSession,
  issueGuestOrderAccessToken,
} from "../src/server/guestOrderStore.js";

const MAX_BODY_BYTES = 8_000;

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

function send(response: any, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.end(JSON.stringify(payload));
}

function publicOrder(row: any) {
  const snapshot = typeof row?.snapshot === "string" ? JSON.parse(row.snapshot) : row?.snapshot;
  return {
    id: row.id,
    quoteId: row.quote_id,
    paymentAttemptId: row.payment_attempt_id,
    status: row.status,
    currency: row.currency,
    totalMinor: Number(row.total_minor || 0),
    provider: row.provider,
    providerReference: row.provider_reference,
    paidAt: row.paid_at,
    createdAt: row.created_at,
    items: Array.isArray(snapshot?.items) ? snapshot.items : [],
    fulfilment: snapshot?.fulfilment || null,
    pricing: snapshot?.pricing || null,
    payment: snapshot?.payment ? {
      provider: snapshot.payment.provider,
      providerReference: snapshot.payment.providerReference,
      confirmationSource: snapshot.payment.confirmationSource,
      confirmedAt: snapshot.payment.confirmedAt,
    } : null,
  };
}

async function currentGuest(request: any) {
  const cookies = parseCookie(firstHeader(request.headers?.cookie));
  const token = cookies[GUEST_CHECKOUT_COOKIE];
  return token ? guestSessionFromToken(token) : null;
}

export default async function handler(request: any, response: any) {
  const method = String(request.method || "GET").toUpperCase();
  if (!["GET", "POST"].includes(method)) {
    response.setHeader("Allow", "GET, POST");
    return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "GET or POST is required." } });
  }
  if (!sameOrigin(request)) return send(response, 403, { error: { code: "ORIGIN_REJECTED", message: "This request was rejected." } });

  try {
    if (method === "GET") {
      const guest = await currentGuest(request);
      if (!guest) return send(response, 401, { error: { code: "GUEST_ORDER_SESSION_REQUIRED", message: "This receipt is no longer available through the current guest session." } });
      const orderId = clean(request.query?.orderId, 80);
      const attemptId = clean(request.query?.attemptId, 100);
      if (!orderId && !attemptId) return send(response, 400, { error: { code: "GUEST_ORDER_REFERENCE_REQUIRED", message: "Choose a valid guest order." } });
      if (attemptId) await finalizeGuestOrderForConfirmedAttempt(attemptId).catch(() => null);
      const order = await getGuestOrderForSession({ guestSessionId: guest.id, orderId: orderId || undefined, attemptId: attemptId || undefined });
      if (!order) return send(response, 404, { error: { code: "GUEST_ORDER_NOT_FOUND", message: "That guest order is not available for this session yet." } });
      return send(response, 200, { order: publicOrder(order) });
    }

    const input = await readJsonBody<{ action?: string; orderId?: string; accessToken?: string }>(request);
    const action = clean(input.action, 40);
    const orderId = clean(input.orderId, 80);
    if (!orderId) return send(response, 400, { error: { code: "GUEST_ORDER_REFERENCE_REQUIRED", message: "Choose a valid guest order." } });

    if (action === "retrieve_with_access_token") {
      const accessToken = clean(input.accessToken, 200);
      if (!accessToken) return send(response, 400, { error: { code: "GUEST_ORDER_ACCESS_REQUIRED", message: "A valid receipt access token is required." } });
      const order = await getGuestOrderByAccessToken({ orderId, token: accessToken });
      if (!order) return send(response, 404, { error: { code: "GUEST_ORDER_ACCESS_INVALID", message: "This receipt link is invalid or expired." } });
      return send(response, 200, { order: publicOrder(order) });
    }

    if (action === "issue_access_link") {
      const guest = await currentGuest(request);
      if (!guest) return send(response, 401, { error: { code: "GUEST_ORDER_SESSION_REQUIRED", message: "The active guest checkout session is required to create a receipt link." } });
      const issued = await issueGuestOrderAccessToken({ guestSessionId: guest.id, orderId });
      if (!issued) return send(response, 404, { error: { code: "GUEST_ORDER_NOT_FOUND", message: "That guest order is not available for this session." } });
      return send(response, 201, { accessToken: issued.token, expiresAt: issued.expiresAt });
    }

    return send(response, 400, { error: { code: "GUEST_ORDER_ACTION_INVALID", message: "Choose a valid guest-order action." } });
  } catch (error: any) {
    if (error instanceof SyntaxError) return send(response, 400, { error: { code: "INVALID_JSON", message: "The request body is invalid." } });
    if (Number(error?.status) === 413) return send(response, 413, { error: { code: "REQUEST_TOO_LARGE", message: "The request is too large." } });
    console.error("guest_order_api_error", { code: error instanceof Error ? error.message : "unknown" });
    return send(response, 503, { error: { code: "GUEST_ORDER_UNAVAILABLE", message: "Guest order details are temporarily unavailable.", retryable: true } });
  }
}
