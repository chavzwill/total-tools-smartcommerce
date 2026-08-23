import { quoteDelivery, type DeliveryQuoteRequest } from "../src/server/deliveryFulfilmentEngine";

const MAX_BODY_BYTES = 32_000;

function send(response: any, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(payload));
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

export default async function handler(request: any, response: any) {
  if (String(request.method || "GET").toUpperCase() !== "POST") {
    response.setHeader("Allow", "POST");
    return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "POST is required." } });
  }

  try {
    const input = await readJsonBody<DeliveryQuoteRequest>(request);
    if (!Array.isArray(input.items)) {
      return send(response, 400, { error: { code: "INVALID_DELIVERY_REQUEST", message: "Delivery items are required." } });
    }

    // This endpoint only prices supplied trusted freight facts. Checkout must source
    // weight, dimensions and parcel eligibility from authoritative product/provider data,
    // never from customer-editable values.
    return send(response, 200, { delivery: quoteDelivery(input) });
  } catch (error: any) {
    const status = Number(error?.status || 500);
    if (status === 413) {
      return send(response, 413, { error: { code: "BODY_TOO_LARGE", message: "The delivery request is too large." } });
    }
    return send(response, 500, { error: { code: "DELIVERY_QUOTE_FAILED", message: "Delivery pricing could not be prepared." } });
  }
}
