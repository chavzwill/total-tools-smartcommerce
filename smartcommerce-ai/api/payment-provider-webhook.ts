import { applyVerifiedProviderEvidence } from "../src/server/paymentProviderEvidence.js";
import { getPaymentProviderAdapter, type PaymentProviderKey } from "../src/server/paymentProviderAdapters.js";

const MAX_WEBHOOK_BYTES = 256_000;
const PROVIDERS = new Set<PaymentProviderKey>(["primary_acquirer", "paypal", "store_pos"]);

async function readRawBody(request: AsyncIterable<unknown>) {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    if (chunk == null) continue;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    total += buffer.length;
    if (total > MAX_WEBHOOK_BYTES) throw Object.assign(new Error("WEBHOOK_TOO_LARGE"), { status: 413 });
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function send(response: any, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(payload));
}

export default async function handler(request: any, response: any) {
  if (String(request.method || "POST").toUpperCase() !== "POST") {
    response.setHeader("Allow", "POST");
    return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "POST is required." } });
  }

  const provider = String(request.query?.provider || "").trim() as PaymentProviderKey;
  if (!PROVIDERS.has(provider)) {
    return send(response, 404, { error: { code: "PAYMENT_PROVIDER_NOT_FOUND", message: "That payment provider is not configured." } });
  }

  const adapter = getPaymentProviderAdapter(provider);
  if (!adapter) {
    return send(response, 503, { error: { code: "PAYMENT_PROVIDER_UNAVAILABLE", message: "Payment verification is temporarily unavailable." } });
  }

  try {
    const rawBody = await readRawBody(request);
    const evidence = await adapter.verifyWebhook({ rawBody, headers: request.headers || {} });
    const result = await applyVerifiedProviderEvidence(provider, evidence);
    return send(response, 200, { received: true, applied: result.applied });
  } catch (error: any) {
    const code = error instanceof Error ? error.message : "unknown";
    if (Number(error?.status) === 413 || code === "WEBHOOK_TOO_LARGE") {
      return send(response, 413, { error: { code: "WEBHOOK_TOO_LARGE", message: "The webhook payload is too large." } });
    }
    if (code === "PAYMENT_PROVIDER_ADAPTER_NOT_CONFIGURED") {
      return send(response, 503, { error: { code: "PAYMENT_PROVIDER_NOT_READY", message: "Payment verification is not configured for this provider." } });
    }
    if (code.startsWith("PAYMENT_PROVIDER_") || code === "PAYMENT_METHOD_PROVIDER_MISMATCH") {
      console.warn("payment_provider_evidence_rejected", { provider, code });
      return send(response, 400, { error: { code: "PAYMENT_EVIDENCE_REJECTED", message: "The payment evidence could not be verified." } });
    }
    console.error("payment_provider_webhook_error", { provider, code: "verification_failed" });
    return send(response, 400, { error: { code: "PAYMENT_WEBHOOK_REJECTED", message: "The payment notification could not be verified." } });
  }
}
