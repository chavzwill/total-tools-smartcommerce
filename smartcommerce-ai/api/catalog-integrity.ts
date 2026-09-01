import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { analyzeCatalogIntegrity } from "../src/server/catalogIntegrity.js";
import { createConfiguredTotalToolsAdapter } from "../src/integrations/totalToolsPlatformRuntime.js";
import type { CommerceProduct, PosAdapterContext } from "../src/platform/index.js";
import { canStaff, parseCookie, readStaffSession, STAFF_COOKIE_NAME } from "../src/server/staffSession.js";

const PAGE_SIZE = 100;
const MAX_PAGES = 20;
const MAX_PRODUCTS = PAGE_SIZE * MAX_PAGES;
let sqlClient: ReturnType<typeof neon> | undefined;
let findingsSchemaReady = false;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("CATALOG_INTEGRITY_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}
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

async function ensureFindingsSchema() {
  if (findingsSchemaReady) return;
  await sql()`CREATE TABLE IF NOT EXISTS catalog_integrity_findings (
    issue_key TEXT PRIMARY KEY,
    issue_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    product_ids JSONB NOT NULL,
    evidence JSONB,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql()`CREATE INDEX IF NOT EXISTS idx_catalog_integrity_findings_seen ON catalog_integrity_findings(last_seen_at DESC)`;
  findingsSchemaReady = true;
}

async function registerFindings(issues: Array<{ issueKey: string; type: string; severity: string; productIds: string[]; evidence?: Record<string, unknown> }>) {
  await ensureFindingsSchema();
  if (!issues.length) return;
  const payload = JSON.stringify(issues.map((issue) => ({
    issue_key: issue.issueKey,
    issue_type: issue.type,
    severity: issue.severity,
    product_ids: issue.productIds,
    evidence: issue.evidence || null,
  })));
  await sql()`INSERT INTO catalog_integrity_findings (issue_key, issue_type, severity, product_ids, evidence)
    SELECT item.issue_key, item.issue_type, item.severity, item.product_ids, item.evidence
    FROM jsonb_to_recordset(${payload}::jsonb) AS item(
      issue_key TEXT,
      issue_type TEXT,
      severity TEXT,
      product_ids JSONB,
      evidence JSONB
    )
    ON CONFLICT (issue_key) DO UPDATE SET
      issue_type=EXCLUDED.issue_type,
      severity=EXCLUDED.severity,
      product_ids=EXCLUDED.product_ids,
      evidence=EXCLUDED.evidence,
      last_seen_at=NOW()`;
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
    const issues = rawReport.issues.map((issue) => ({ ...issue, issueKey: findingKey(issue) }));
    await registerFindings(issues);
    const report = { ...rawReport, issues };
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
