import { quoteDelivery } from "../src/server/deliveryFulfilmentEngine.js";
import { resolveDeliveryItems } from "../src/server/deliveryProductFacts.js";
import { resolveJamaicaDeliveryZone } from "../src/server/jamaicaDeliveryZones.js";

const MAX_BODY_BYTES = 32_000;

type DeliveryQuoteApiInput = {
  items: Array<{
    productId: string;
    quantity: number;
    fulfilmentType?: "sale" | "rental";
  }>;
  destinationCountryCode?: string;
  requestedSpeed?: "standard" | "same_day";
  address?: {
    city?: string;
    region?: string;
    countryCode?: string;
  };
};

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

function validItems(input: unknown): input is DeliveryQuoteApiInput["items"] {
  return Array.isArray(input) && input.length > 0 && input.length <= 100 && input.every((item: any) =>
    typeof item?.productId === "string" &&
    item.productId.trim().length > 0 &&
    item.productId.length <= 180 &&
    Number.isInteger(Number(item.quantity)) &&
    Number(item.quantity) > 0 &&
    Number(item.quantity) <= 999 &&
    (item.fulfilmentType === undefined || item.fulfilmentType === "sale" || item.fulfilmentType === "rental")
  );
}

export default async function handler(request: any, response: any) {
  if (String(request.method || "GET").toUpperCase() !== "POST") {
    response.setHeader("Allow", "POST");
    return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "POST is required." } });
  }

  try {
    const input = await readJsonBody<DeliveryQuoteApiInput>(request);
    if (!validItems(input.items)) {
      return send(response, 400, { error: { code: "INVALID_DELIVERY_REQUEST", message: "Valid delivery items are required." } });
    }

    const countryCode = String(input.address?.countryCode || input.destinationCountryCode || "JM").toUpperCase().slice(0, 2);
    const items = await resolveDeliveryItems(input.items.map((item) => ({
      productId: item.productId.trim(),
      quantity: Number(item.quantity),
      fulfilmentType: item.fulfilmentType || "sale",
    })));

    if (countryCode !== "JM") {
      const delivery = quoteDelivery({ items, destinationCountryCode: countryCode, requestedSpeed: input.requestedSpeed });
      return send(response, 200, { delivery, zone: null });
    }

    const zone = resolveJamaicaDeliveryZone({ town: input.address?.city, parish: input.address?.region });
    if (zone.status === "unresolved") {
      return send(response, 200, {
        zone,
        delivery: {
          status: "manual_review",
          reasonCode: "DELIVERY_ZONE_UNRESOLVED",
          message: zone.message,
          options: [],
        },
      });
    }

    const delivery = quoteDelivery({
      items,
      destinationCountryCode: "JM",
      destinationClass: zone.destinationClass,
      requestedSpeed: input.requestedSpeed,
      sameDayEligible: zone.sameDayEligible,
    });

    return send(response, 200, { delivery, zone });
  } catch (error: any) {
    const status = Number(error?.status || 500);
    if (status === 413) {
      return send(response, 413, { error: { code: "BODY_TOO_LARGE", message: "The delivery request is too large." } });
    }
    return send(response, 500, { error: { code: "DELIVERY_QUOTE_FAILED", message: "Delivery pricing could not be prepared." } });
  }
}
