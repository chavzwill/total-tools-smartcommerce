import type { CommerceProduct, PlatformEntityId } from "../platform";
import type { PosAdapter, PosAdapterContext } from "../platform";
import { retryPlatformRead } from "./aiReliability.js";

type ProductPriceFact = {
  value: number;
  currency: string;
};

type ProductComparisonFact = {
  product: CommerceProduct;
  availability: string[];
  price?: ProductPriceFact;
};

function displayedPrice(product: CommerceProduct): ProductPriceFact | undefined {
  for (const pricing of product.pricing || []) {
    const value = pricing.salePrice ?? pricing.listPrice ?? pricing.commercialPrice;
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return { value, currency: pricing.currency || "JMD" };
    }
  }
  return undefined;
}

function formatPrice(price: ProductPriceFact) {
  try {
    return new Intl.NumberFormat("en-JM", {
      style: "currency",
      currency: price.currency,
      maximumFractionDigits: 2,
    }).format(price.value);
  } catch {
    return `${price.currency} ${price.value.toLocaleString("en-JM")}`;
  }
}

function availabilityLabel(statuses: string[]) {
  if (statuses.includes("in_stock")) return "in stock";
  if (statuses.includes("low_stock")) return "low stock";
  if (statuses.includes("reserved")) return "reserved";
  if (statuses.includes("backordered")) return "backordered";
  if (statuses.includes("out_of_stock")) return "out of stock";
  return "availability not confirmed";
}

function safeAttributeEntries(product: CommerceProduct) {
  return Object.entries(product.attributes || {}).filter(([, value]) =>
    value !== null && ["string", "number", "boolean"].includes(typeof value)
  );
}

function comparableAttributeFacts(products: CommerceProduct[]) {
  const keys = new Set<string>();
  products.forEach((product) => safeAttributeEntries(product).forEach(([key]) => keys.add(key)));

  const facts: string[] = [];
  for (const key of keys) {
    const values = products.map((product) => product.attributes?.[key]);
    const present = values.filter((value) => value !== undefined && value !== null);
    if (present.length < 2) continue;
    if (new Set(present.map((value) => String(value))).size < 2) continue;
    const detail = products
      .map((product, index) => values[index] === undefined || values[index] === null ? "" : `${product.name}: ${String(values[index])}`)
      .filter(Boolean)
      .join("; ");
    if (detail) facts.push(`${key}: ${detail}`);
    if (facts.length >= 4) break;
  }
  return facts;
}

async function comparisonFacts(
  adapter: PosAdapter,
  context: PosAdapterContext,
  products: CommerceProduct[],
  branchId?: PlatformEntityId,
): Promise<ProductComparisonFact[]> {
  return Promise.all(products.map(async (product) => {
    if (!branchId) return { product, availability: [], price: displayedPrice(product) };
    const result = await retryPlatformRead("assistant comparison inventory", () =>
      adapter.getInventoryAvailability(context, {
        productId: product.id,
        branchId,
        quantity: 1,
      }),
    { timeoutMs: 6_000, retries: 1 });

    return {
      product,
      availability: result.success ? result.data.map((item) => String(item.status)) : [],
      price: displayedPrice(product),
    };
  }));
}

export async function buildGroundedProductComparison(
  adapter: PosAdapter,
  context: PosAdapterContext,
  products: CommerceProduct[],
  branchId?: PlatformEntityId,
) {
  const shortlist = products.slice(0, 3);
  if (shortlist.length < 2) return undefined;

  const facts = await comparisonFacts(adapter, context, shortlist, branchId);
  const names = facts.map(({ product }) => product.name).join(" vs ");
  const sentences = [`Comparison: ${names}.`];

  const priced = facts.filter((fact): fact is ProductComparisonFact & { price: ProductPriceFact } => Boolean(fact.price));
  if (priced.length >= 2) {
    const currencies = new Set(priced.map((fact) => fact.price.currency));
    if (currencies.size === 1) {
      const ordered = [...priced].sort((a, b) => a.price.value - b.price.value);
      const priceDetails = priced.map((fact) => `${fact.product.name} ${formatPrice(fact.price)}`).join(", ");
      sentences.push(`${priceDetails}. ${ordered[0].product.name} is the lower-priced provider-listed option among the products with comparable pricing.`);
    } else {
      sentences.push(`Provider pricing uses different currencies across these products, so SmartCommerce will not rank them by price.`);
    }
  }

  if (branchId) {
    const availability = facts.map((fact) => `${fact.product.name}: ${availabilityLabel(fact.availability)}`).join("; ");
    sentences.push(`Selected-branch availability — ${availability}.`);
  }

  const attributeFacts = comparableAttributeFacts(shortlist);
  if (attributeFacts.length) {
    sentences.push(`Catalogue differences — ${attributeFacts.join(" | ")}.`);
  } else {
    sentences.push("The connected catalogue does not provide enough differing technical attributes to declare one option technically better.");
  }

  return sentences.join(" ");
}
