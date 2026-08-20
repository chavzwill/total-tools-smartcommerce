import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const previewAdapter = await readFile(new URL("../src/integrations/previewCommerceAdapter.ts", import.meta.url), "utf8");
const runtime = await readFile(new URL("../src/integrations/totalToolsPlatformRuntime.ts", import.meta.url), "utf8");
const assistantGateway = await readFile(new URL("../api/assistant.ts", import.meta.url), "utf8");

const invariants = [
  ["preview adapter includes the backhoe shown in the storefront rental catalogue", previewAdapter.includes('name: "JCB 3CX Backhoe Loader"')],
  ["preview inventory is never represented as verified live stock", previewAdapter.includes('status: "unknown"') && previewAdapter.includes('liveVerified: false')],
  ["preview writes remain disabled", previewAdapter.includes('code: "PREVIEW_WRITE_UNAVAILABLE"')],
  ["preview adapter is enabled only for Vercel preview or explicit preview flag", previewAdapter.includes('process.env.VERCEL_ENV === "preview"') && previewAdapter.includes('SMARTCOMMERCE_ENABLE_PREVIEW_CATALOGUE')],
  ["real POS configuration takes precedence over preview catalogue", runtime.indexOf("const configuredBaseUrl") < runtime.indexOf("previewCatalogueEnabled() ? createPreviewCommerceAdapter()")],
  ["runtime falls back to preview adapter instead of unsupported adapter in preview", runtime.includes("previewCatalogueEnabled() ? createPreviewCommerceAdapter() : unsupportedPlatformAdapter")],
  ["assistant summary labels preview catalogue rather than connected live catalogue", runtime.includes('"SmartCommerce preview catalogue"') && runtime.includes("live branch stock and availability still require the connected Total Tools provider")],
  ["assistant gateway uses preview provider identity in preview mode", assistantGateway.includes('preview ? "preview-catalogue" : "public-unsupported"')],
  ["assistant gateway uses preview business identity in preview mode", assistantGateway.includes('preview ? "preview-total-tools" : "public-catalog"')],
];

for (const [description, satisfied] of invariants) {
  assert.ok(satisfied, `Missing preview catalogue intelligence invariant: ${description}`);
}

console.log(`Preview catalogue intelligence regression gate passed (${invariants.length} invariants).`);
