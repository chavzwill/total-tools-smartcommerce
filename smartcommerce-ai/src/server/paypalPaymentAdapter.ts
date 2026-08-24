import type {
  PaymentProviderAdapter,
  PaymentProviderLaunchInput,
  PaymentProviderVerificationResult,
} from "./paymentProviderAdapters.js";

const SUPPORTED_CURRENCIES = new Set([
  "AUD", "BRL", "CAD", "CNY", "CZK", "DKK", "EUR", "HKD", "HUF", "ILS", "JPY",
  "MYR", "MXN", "TWD", "NZD", "NOK", "PHP", "PLN", "GBP", "RUB", "SGD", "SEK",
  "CHF", "THB", "USD",
]);
const ZERO_DECIMAL = new Set(["HUF", "JPY", "TWD"]);
const REQUEST_TIMEOUT_MS = 12_000;

function configured(value: string | undefined) {
  return Boolean(value && value.trim());
}

function baseUrl() {
  return process.env.PAYPAL_ENVIRONMENT === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

function assertConfigured() {
  if (!configured(process.env.PAYPAL_CLIENT_ID) || !configured(process.env.PAYPAL_CLIENT_SECRET) || !configured(process.env.PAYPAL_WEBHOOK_ID)) {
    throw new Error("PAYMENT_PROVIDER_ADAPTER_NOT_CONFIGURED");
  }
}

function header(headers: Record<string, string | string[] | undefined>, name: string) {
  const direct = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
  return Array.isArray(direct) ? direct[0] : direct;
}

async function paypalFetch(path: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl()}${path}`, { ...init, signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error("PAYPAL_PROVIDER_REQUEST_FAILED");
      Object.assign(error, { status: response.status, providerDebugId: response.headers.get("paypal-debug-id") || undefined });
      throw error;
    }
    return body as any;
  } finally {
    clearTimeout(timer);
  }
}

async function accessToken() {
  assertConfigured();
  const credentials = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const body = await paypalFetch("/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: "grant_type=client_credentials",
  });
  if (!body?.access_token) throw new Error("PAYPAL_ACCESS_TOKEN_MISSING");
  return String(body.access_token);
}

function amountValue(currency: string, amountMinor: number) {
  const code = currency.toUpperCase();
  if (!SUPPORTED_CURRENCIES.has(code)) throw new Error("PAYPAL_CURRENCY_UNSUPPORTED");
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error("PAYPAL_AMOUNT_INVALID");
  return ZERO_DECIMAL.has(code) ? String(amountMinor) : (amountMinor / 100).toFixed(2);
}

function parseAmountMinor(currency: string, value: unknown) {
  const code = String(currency || "").toUpperCase();
  const numeric = Number(value);
  if (!SUPPORTED_CURRENCIES.has(code) || !Number.isFinite(numeric) || numeric < 0) return null;
  return ZERO_DECIMAL.has(code) ? Math.round(numeric) : Math.round(numeric * 100);
}

async function getOrder(orderId: string) {
  const token = await accessToken();
  return paypalFetch(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
}

function evidenceFromOrder(order: any, source: "verified_webhook" | "server_side_provider_query"): PaymentProviderVerificationResult {
  const purchaseUnit = Array.isArray(order?.purchase_units) ? order.purchase_units[0] : undefined;
  const capture = purchaseUnit?.payments?.captures?.find((item: any) => item?.status === "COMPLETED") || purchaseUnit?.payments?.captures?.[0];
  const attemptId = String(purchaseUnit?.custom_id || "").trim();
  const currency = String(capture?.amount?.currency_code || purchaseUnit?.amount?.currency_code || "").toUpperCase();
  const amountMinor = parseAmountMinor(currency, capture?.amount?.value ?? purchaseUnit?.amount?.value);
  const orderId = String(order?.id || "").trim();

  if (order?.status === "COMPLETED" && capture?.status === "COMPLETED" && attemptId && orderId && currency && amountMinor != null) {
    return {
      status: "confirmed",
      attemptId,
      providerPaymentId: orderId,
      providerReference: String(capture.id || orderId),
      currency,
      amountMinor,
      source,
    };
  }
  if (order?.status === "VOIDED") return { status: "cancelled", attemptId: attemptId || undefined, providerPaymentId: orderId || undefined, source };
  return { status: "pending", attemptId: attemptId || undefined, providerPaymentId: orderId || undefined, source };
}

async function launch(input: PaymentProviderLaunchInput) {
  assertConfigured();
  if (input.paymentMethod !== "paypal") throw new Error("PAYMENT_METHOD_PROVIDER_MISMATCH");
  const currency = input.currency.toUpperCase();
  const value = amountValue(currency, input.amountMinor);
  const token = await accessToken();
  const order = await paypalFetch("/v2/checkout/orders", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      Prefer: "return=representation",
      "PayPal-Request-Id": input.attemptId,
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{
        reference_id: input.quoteId,
        custom_id: input.attemptId,
        invoice_id: input.quoteId,
        amount: { currency_code: currency, value },
      }],
      application_context: {
        return_url: input.returnUrl,
        cancel_url: input.cancelUrl,
        user_action: "PAY_NOW",
        shipping_preference: "NO_SHIPPING",
      },
    }),
  });
  const approve = Array.isArray(order?.links) ? order.links.find((item: any) => item?.rel === "approve" && item?.href) : undefined;
  if (!order?.id || !approve?.href) throw new Error("PAYPAL_APPROVAL_LINK_MISSING");
  return { status: "pending" as const, providerPaymentId: String(order.id), launchUrl: String(approve.href) };
}

async function verifyWebhook(input: { rawBody: Buffer; headers: Record<string, string | string[] | undefined> }): Promise<PaymentProviderVerificationResult> {
  assertConfigured();
  const event = JSON.parse(input.rawBody.toString("utf8") || "{}");
  const transmissionId = header(input.headers, "paypal-transmission-id");
  const transmissionTime = header(input.headers, "paypal-transmission-time");
  const certUrl = header(input.headers, "paypal-cert-url");
  const authAlgo = header(input.headers, "paypal-auth-algo");
  const transmissionSig = header(input.headers, "paypal-transmission-sig");
  if (![transmissionId, transmissionTime, certUrl, authAlgo, transmissionSig].every(configured)) {
    throw new Error("PAYPAL_WEBHOOK_HEADERS_INCOMPLETE");
  }
  const token = await accessToken();
  const verification = await paypalFetch("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      transmission_id: transmissionId,
      transmission_time: transmissionTime,
      cert_url: certUrl,
      auth_algo: authAlgo,
      transmission_sig: transmissionSig,
      webhook_id: process.env.PAYPAL_WEBHOOK_ID,
      webhook_event: event,
    }),
  });
  if (verification?.verification_status !== "SUCCESS") throw new Error("PAYPAL_WEBHOOK_SIGNATURE_INVALID");

  const relatedOrderId = String(event?.resource?.supplementary_data?.related_ids?.order_id || event?.resource?.id || "").trim();
  if (!relatedOrderId) return { status: "ignored", source: "verified_webhook" };
  const order = await getOrder(relatedOrderId);
  return evidenceFromOrder(order, "verified_webhook");
}

async function query(input: { attemptId: string; providerPaymentId: string }): Promise<PaymentProviderVerificationResult> {
  assertConfigured();
  const order = await getOrder(input.providerPaymentId);
  const evidence = evidenceFromOrder(order, "server_side_provider_query");
  if (evidence.attemptId && evidence.attemptId !== input.attemptId) throw new Error("PAYMENT_PROVIDER_TRANSACTION_MISMATCH");
  return evidence;
}

async function completeReturn(input: { attemptId: string; providerPaymentId: string; query: Record<string, string | string[] | undefined> }): Promise<PaymentProviderVerificationResult> {
  assertConfigured();
  const tokenParam = Array.isArray(input.query.token) ? input.query.token[0] : input.query.token;
  if (!tokenParam || tokenParam !== input.providerPaymentId) throw new Error("PAYMENT_PROVIDER_TRANSACTION_MISMATCH");

  const before = await getOrder(input.providerPaymentId);
  const purchaseUnit = Array.isArray(before?.purchase_units) ? before.purchase_units[0] : undefined;
  if (String(purchaseUnit?.custom_id || "") !== input.attemptId) throw new Error("PAYMENT_PROVIDER_TRANSACTION_MISMATCH");
  if (before?.status === "COMPLETED") return evidenceFromOrder(before, "server_side_provider_query");
  if (before?.status !== "APPROVED") return evidenceFromOrder(before, "server_side_provider_query");

  const token = await accessToken();
  await paypalFetch(`/v2/checkout/orders/${encodeURIComponent(input.providerPaymentId)}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      Prefer: "return=representation",
      "PayPal-Request-Id": `${input.attemptId}-capture`,
    },
    body: "{}",
  });
  const after = await getOrder(input.providerPaymentId);
  return evidenceFromOrder(after, "server_side_provider_query");
}

export const paypalPaymentAdapter: PaymentProviderAdapter = {
  key: "paypal",
  supports: ["paypal"],
  launch,
  verifyWebhook,
  query,
  completeReturn,
};

export function paypalSupportsCurrency(currency: string) {
  return SUPPORTED_CURRENCIES.has(String(currency || "").toUpperCase());
}
