import type { CommerceProduct, ProductPricing } from "../platform/contracts";

export type CatalogIntegritySeverity = "info" | "warning" | "critical";
export type CatalogIntegrityIssueType =
  | "duplicate_sku"
  | "duplicate_barcode"
  | "probable_duplicate_product"
  | "missing_identifier"
  | "missing_price"
  | "invalid_price"
  | "conflicting_price"
  | "stale_record"
  | "inactive_but_purchasable";

export type CatalogIntegrityIssue = {
  type: CatalogIntegrityIssueType;
  severity: CatalogIntegritySeverity;
  productIds: string[];
  message: string;
  evidence?: Record<string, string | number | boolean | null>;
};

export type CatalogIntegrityReport = {
  scannedProducts: number;
  activeProducts: number;
  inactiveProducts: number;
  issueCount: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  issues: CatalogIntegrityIssue[];
  scannedAt: string;
};

const STALE_DAYS_DEFAULT = 180;

function normalizedToken(value?: string) {
  return (value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizedIdentifier(value?: string) {
  return normalizedToken(value).replace(/\s+/g, "");
}

function probableProductKey(product: CommerceProduct) {
  const name = normalizedToken(product.name);
  const brand = normalizedToken(product.brand);
  if (!name) return "";
  return `${brand}|${name}`;
}

function latestTimestamp(product: CommerceProduct) {
  const metadata = product.metadata || {};
  const candidates = [
    metadata.updatedAt,
    metadata.updated_at,
    metadata.lastSyncedAt,
    metadata.last_synced_at,
    metadata.syncedAt,
    metadata.synced_at,
    metadata.modifiedAt,
    metadata.modified_at,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const parsed = Date.parse(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function priceValues(pricing: ProductPricing[]) {
  const rows: Array<{ currency: string; kind: string; value: number }> = [];
  for (const price of pricing) {
    for (const [kind, raw] of [
      ["list", price.listPrice],
      ["sale", price.salePrice],
      ["commercial", price.commercialPrice],
    ] as const) {
      if (typeof raw === "number") rows.push({ currency: price.currency, kind, value: raw });
    }
  }
  return rows;
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const token = key(item);
    if (!token) continue;
    const bucket = groups.get(token) || [];
    bucket.push(item);
    groups.set(token, bucket);
  }
  return groups;
}

export function analyzeCatalogIntegrity(
  products: CommerceProduct[],
  options?: { now?: Date; staleDays?: number }
): CatalogIntegrityReport {
  const now = options?.now || new Date();
  const staleDays = Math.max(1, options?.staleDays || STALE_DAYS_DEFAULT);
  const staleBefore = now.getTime() - staleDays * 86_400_000;
  const issues: CatalogIntegrityIssue[] = [];

  const skuGroups = groupBy(products, (product) => normalizedIdentifier(product.sku));
  for (const [sku, matches] of skuGroups) {
    const active = matches.filter((product) => product.active);
    if (active.length < 2) continue;
    issues.push({
      type: "duplicate_sku",
      severity: "critical",
      productIds: active.map((product) => product.id),
      message: `Multiple active products share SKU ${sku}.`,
      evidence: { normalizedSku: sku, count: active.length },
    });
  }

  const barcodeGroups = groupBy(products, (product) => normalizedIdentifier(product.barcode));
  for (const [barcode, matches] of barcodeGroups) {
    const active = matches.filter((product) => product.active);
    if (active.length < 2) continue;
    issues.push({
      type: "duplicate_barcode",
      severity: "critical",
      productIds: active.map((product) => product.id),
      message: `Multiple active products share barcode ${barcode}.`,
      evidence: { normalizedBarcode: barcode, count: active.length },
    });
  }

  const probableGroups = groupBy(products, probableProductKey);
  for (const [key, matches] of probableGroups) {
    const active = matches.filter((product) => product.active);
    if (active.length < 2) continue;
    const distinctSkus = new Set(active.map((product) => normalizedIdentifier(product.sku)).filter(Boolean));
    const distinctBarcodes = new Set(active.map((product) => normalizedIdentifier(product.barcode)).filter(Boolean));
    if (distinctSkus.size <= 1 && distinctBarcodes.size <= 1) continue;
    issues.push({
      type: "probable_duplicate_product",
      severity: "warning",
      productIds: active.map((product) => product.id),
      message: "Multiple active products have the same normalized brand and product name but different identifiers.",
      evidence: { normalizedProductKey: key, count: active.length },
    });
  }

  for (const product of products) {
    if (product.active && !normalizedIdentifier(product.sku) && !normalizedIdentifier(product.barcode)) {
      issues.push({
        type: "missing_identifier",
        severity: "warning",
        productIds: [product.id],
        message: "Active product has neither SKU nor barcode.",
      });
    }

    if (!product.active && product.purchasable === true) {
      issues.push({
        type: "inactive_but_purchasable",
        severity: "critical",
        productIds: [product.id],
        message: "Inactive product is still marked purchasable.",
      });
    }

    const pricing = product.pricing || [];
    const prices = priceValues(pricing);
    if (product.active && product.purchasable !== false && prices.length === 0) {
      issues.push({
        type: "missing_price",
        severity: "critical",
        productIds: [product.id],
        message: "Active purchasable product has no usable price.",
      });
    }

    for (const price of prices) {
      if (!Number.isFinite(price.value) || price.value < 0) {
        issues.push({
          type: "invalid_price",
          severity: "critical",
          productIds: [product.id],
          message: `Product contains an invalid ${price.kind} price.`,
          evidence: { currency: price.currency, value: price.value },
        });
      }
    }

    for (const price of pricing) {
      if (
        typeof price.listPrice === "number" &&
        typeof price.salePrice === "number" &&
        price.salePrice > price.listPrice
      ) {
        issues.push({
          type: "conflicting_price",
          severity: "warning",
          productIds: [product.id],
          message: "Sale price is greater than list price.",
          evidence: { currency: price.currency, listPrice: price.listPrice, salePrice: price.salePrice },
        });
      }
    }

    const timestamp = latestTimestamp(product);
    if (product.active && timestamp !== undefined && timestamp < staleBefore) {
      issues.push({
        type: "stale_record",
        severity: "warning",
        productIds: [product.id],
        message: `Active product has not been refreshed within ${staleDays} days.`,
        evidence: { lastKnownUpdate: new Date(timestamp).toISOString(), staleDays },
      });
    }
  }

  return {
    scannedProducts: products.length,
    activeProducts: products.filter((product) => product.active).length,
    inactiveProducts: products.filter((product) => !product.active).length,
    issueCount: issues.length,
    criticalCount: issues.filter((issue) => issue.severity === "critical").length,
    warningCount: issues.filter((issue) => issue.severity === "warning").length,
    infoCount: issues.filter((issue) => issue.severity === "info").length,
    issues,
    scannedAt: now.toISOString(),
  };
}
