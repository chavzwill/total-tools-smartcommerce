import { createHash } from "node:crypto";
import { analyzeCatalogIntegrity } from "../src/server/catalogIntegrity.js";
import { createConfiguredTotalToolsAdapter } from "../src/integrations/totalToolsPlatformRuntime.js";
import type { CommerceProduct, PosAdapterContext } from "../src/platform/index.js";
import { canStaff, parseCookie, readStaffSession, STAFF_COOKIE_NAME } from "../src/server/staffSession.js";

const PAGE_SIZE = 100;
const MAX_PAGES = 20;
const MAX_PRODUCTS = PAGE_SIZE * MAX_PAGES;

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function send(response: any, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(payload));
}

function boundedStaleDays(request: any) {
  const rawUrl = String(request.url || "/api/catalog-integrity");
  const url = new URL(rawUrl, "https://smartcommerce.internal");
  const parsed = Number(url.searchParams.get("staleDays") || 180);
  if (!Number.isFinite(parsed)) return 180;
  return Math.max(30, Math.min(730, Math.trunc(parsed)));
}

function trustedContext(): PosAdapterContext {
  return {
    businessAccountId: process.env.SMARTCOMMERCE_BUSINESS_ACCOUNT_ID?.trim() || "",
    providerId:
      process.env.SMARTCOMMERCE_PROVIDER_ID?.trim() ||
      (process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_URL ? "total-tools-pos" : "unsupported"),
    requestId: crypto.randomUUID(),
  };
}

function hasUsableTimestamp(product: CommerceProduct) {
  const metadata = product.metadata || {};
  for (const key of [
    "updatedAt",
    "updated_at",
    "lastSyncedAt",
    "last_synced_at",
    "syncedAt",
    "synced_at",
    "modifiedAt",
    "modified_at",
  ]) {
    const value = metadata[key];
    if (typeof value === "string" && Number.isFinite(Date.parse(value))) return true;
  }
  return false;
}

function stalenessEvidence(products: CommerceProduct[]) {
  const active = products.filter((product) => product.active);
  const withTimestamp = active.filter(hasUsableTimestamp).length;
  return {
    activeProducts: active.length,
    timestampedActiveProducts: withTimestamp,
    coveragePercent: active.length ? Math.round((withTimestamp / active.length) * 100) : 100,
  };
}

function stableEvidence(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => ["string", "number", "boolean"].includes(typeof item) || item === null)
    .sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify(entries);
}

function findingKey(issue: { type: string; productIds: string[]; evidence?: Record<string, unknown> }) {
  const canonical = [
    issue.type,
    [...issue.productIds].map(String).sort().join(","),
    stableEvidence(issue.evidence),
  ].join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

async function loadCatalog() {
  const adapter = createConfiguredTotalToolsAdapter();
  const context = trustedContext();
  const products: CommerceProduct[] = [];
  let truncated = false;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await adapter.searchProducts(context, {
      includeInactive: true,
      page,
      pageSize: PAGE_SIZE,
    });
    if (!result.success) {
      return { ok: false as const, code: result.error.code || "CATALOG_READ_FAILED" };
    }

    products.push(...result.data.items.slice(0, Math.max(0, MAX_PRODUCTS - products.length)));
    if (products.length >= MAX_PRODUCTS) {
      truncated = result.data.hasNextPage || result.data.items.length >= PAGE_SIZE;
      break;
    }
    if (!result.data.hasNextPage) break;
  }

  return { ok: true as const, products, truncated };
}

export default async function handler(request: any, response: any) {
  if (String(request.method || "GET").toUpperCase() !== "GET") {
    response.setHeader("Allow", "GET");
    return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "GET is required." } });
  }

  const cookies = parseCookie(firstHeader(request.headers?.cookie));
  const session = readStaffSession(cookies[STAFF_COOKIE_NAME]);
  if (!session) {
    return send(response, 401, { error: { code: "STAFF_AUTH_REQUIRED", message: "Staff sign-in is required." } });
  }
  if (!canStaff(session, "inventory")) {
    return send(response, 403, { error: { code: "INVENTORY_PERMISSION_REQUIRED", message: "Inventory permission is required." } });
  }

  try {
    const catalog = await loadCatalog();
    if (!catalog.ok) {
      console.error("catalog_integrity_provider_read_failed", { code: catalog.code });
      return send(response, 503, {
        error: { code: "CATALOG_INTEGRITY_UNAVAILABLE", message: "Catalog integrity data is temporarily unavailable." },
      });
    }

    const staleDays = boundedStaleDays(request);
    const rawReport = analyzeCatalogIntegrity(catalog.products, { staleDays });
    const report = {
      ...rawReport,
      issues: rawReport.issues.map((issue) => ({ ...issue, issueKey: findingKey(issue) })),
    };
    return send(response, 200, {
      report,
      source: {
        providerId: trustedContext().providerId,
        staleDays,
        truncated: catalog.truncated,
        scanLimit: MAX_PRODUCTS,
        stalenessEvidence: stalenessEvidence(catalog.products),
      },
    });
  } catch (error) {
    console.error("catalog_integrity_error", { code: error instanceof Error ? error.message : "unknown" });
    return send(response, 503, {
      error: { code: "CATALOG_INTEGRITY_UNAVAILABLE", message: "Catalog integrity data is temporarily unavailable." },
    });
  }
}
