import { handlePlatformRestRequest } from "../backend/platformRestApi.js";
import { createConfiguredTotalToolsPlatformService } from "../integrations/totalToolsPlatformRuntime.js";
import type { CommerceProduct } from "../platform/contracts.js";
import type { DeliveryItem } from "./deliveryFulfilmentEngine.js";

const platformService = createConfiguredTotalToolsPlatformService();

type DeliveryLineInput = {
  productId: string;
  quantity: number;
  fulfilmentType?: "sale" | "rental";
};

type ScalarMap = Record<string, string | number | boolean | null>;

function trustedPlatformHeaders() {
  const headers = new Headers({ Accept: "application/json" });
  const businessAccountId = process.env.SMARTCOMMERCE_BUSINESS_ACCOUNT_ID?.trim();
  const providerId = process.env.SMARTCOMMERCE_PROVIDER_ID?.trim();
  if (businessAccountId) headers.set("x-business-account-id", businessAccountId);
  if (providerId) headers.set("x-provider-id", providerId);
  return headers;
}

async function fetchProduct(productId: string): Promise<CommerceProduct | undefined> {
  const request = new Request(
    `https://smartcommerce.internal/api/platform/products/${encodeURIComponent(productId)}`,
    { method: "GET", headers: trustedPlatformHeaders() },
  );
  const response = await handlePlatformRestRequest(request, platformService);
  if (!response.ok) return undefined;
  const payload = await response.json().catch(() => undefined) as any;
  if (!payload?.success || !payload.data) return undefined;
  return payload.data as CommerceProduct;
}

function mergedFacts(product: CommerceProduct): ScalarMap {
  return {
    ...(product.metadata || {}),
    ...(product.attributes || {}),
  };
}

function firstValue(facts: ScalarMap, keys: string[]) {
  for (const key of keys) {
    const value = facts[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function numberFact(facts: ScalarMap, keys: string[]) {
  const value = firstValue(facts, keys);
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
}

function booleanFact(facts: ScalarMap, keys: string[]) {
  const value = firstValue(facts, keys);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "1", "eligible"].includes(normalized)) return true;
    if (["false", "no", "0", "ineligible"].includes(normalized)) return false;
  }
  return undefined;
}

function freightFacts(product: CommerceProduct, quantity: number): DeliveryItem {
  const facts = mergedFacts(product);
  return {
    id: product.id,
    quantity,
    fulfilmentType: "sale",
    parcelEligible: booleanFact(facts, ["parcelEligible", "parcel_eligible", "courierEligible", "courier_eligible"]),
    weightLb: numberFact(facts, ["shippingWeightLb", "shipping_weight_lb", "packageWeightLb", "package_weight_lb", "weightLb", "weight_lb"]),
    lengthIn: numberFact(facts, ["packageLengthIn", "package_length_in", "shippingLengthIn", "shipping_length_in", "lengthIn", "length_in"]),
    widthIn: numberFact(facts, ["packageWidthIn", "package_width_in", "shippingWidthIn", "shipping_width_in", "widthIn", "width_in"]),
    heightIn: numberFact(facts, ["packageHeightIn", "package_height_in", "shippingHeightIn", "shipping_height_in", "heightIn", "height_in"]),
    oversized: booleanFact(facts, ["oversized", "oversize", "freightOnly", "freight_only"]),
    hazardous: booleanFact(facts, ["hazardous", "hazmat", "dangerousGoods", "dangerous_goods"]),
    fragileFreight: booleanFact(facts, ["fragileFreight", "fragile_freight", "specialHandling", "special_handling"]),
  };
}

export async function resolveDeliveryItems(lines: DeliveryLineInput[]): Promise<DeliveryItem[]> {
  return Promise.all(lines.map(async (line) => {
    const quantity = Math.max(1, Math.min(999, Math.floor(Number(line.quantity || 1))));
    if (line.fulfilmentType === "rental") {
      return { id: line.productId, quantity, fulfilmentType: "rental", parcelEligible: false } satisfies DeliveryItem;
    }

    const product = await fetchProduct(line.productId);
    if (!product || product.active === false || product.purchasable === false) {
      return { id: line.productId, quantity, fulfilmentType: "sale" } satisfies DeliveryItem;
    }
    return freightFacts(product, quantity);
  }));
}
