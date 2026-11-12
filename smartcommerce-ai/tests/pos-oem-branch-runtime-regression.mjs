import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// Exercise the actual TypeScript implementations, not just source-text markers.
// These two modules import types only, so transpilation needs no app server.
async function loadModule(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, {
    fileName: path,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
}

// The catalogue uses a least-privileged server-only credential, while order
// delivery retains its independent POS write authorization.
const runtimeConfig = await readFile(new URL("../src/integrations/totalToolsPlatformRuntime.ts", import.meta.url), "utf8");
const viteConfig = await readFile(new URL("../vite.config.ts", import.meta.url), "utf8");
const orderDelivery = await readFile(new URL("../api/pos-order-delivery.ts", import.meta.url), "utf8");
for (const source of [runtimeConfig, viteConfig]) {
  assert.equal(source.includes("SMARTCOMMERCE_TOTAL_TOOLS_POS_READ_API_KEY"), true,
    "read adapters prefer a separate least-privileged POS key");
  assert.equal(source.indexOf("SMARTCOMMERCE_TOTAL_TOOLS_POS_READ_API_KEY") <
    source.indexOf("SMARTCOMMERCE_TOTAL_TOOLS_POS_API_KEY"), true,
    "read-only credential must take precedence over legacy shared key");
}
assert.equal(orderDelivery.includes("SMARTCOMMERCE_TOTAL_TOOLS_POS_API_KEY"), true,
  "existing order worker keeps its independent write-capable integration key");
assert.equal(orderDelivery.includes("SMARTCOMMERCE_TOTAL_TOOLS_POS_READ_API_KEY"), false,
  "catalogue key must never authorize POS order delivery");

const { createTotalToolsPosReadAdapter } = await loadModule("../src/integrations/totalToolsPosReadAdapter.ts");
const { buildPartsFitmentIndex } = await loadModule("../src/lib/partsFitment.ts");
// A Vercel protection bypass is separate from POS authorization and must
// never be forwarded to non-Vercel providers or to the browser.
const protectedHeaders = [];
const protectedAdapter = createTotalToolsPosReadAdapter({
  baseUrl: "https://pos-system-rouge-ten.vercel.app",
  apiKey: "test-catalogue-key",
  deploymentProtectionBypass: "test-protection-secret",
  fetchImpl: async (_url, init) => {
    protectedHeaders.push(init.headers);
    return { ok: true, json: async () => [] };
  },
});
const protectedBranchResult = await protectedAdapter.listBranches({
  providerId: "total-tools-pos", businessAccountId: "test-account", requestId: "test-request",
});
assert.equal(protectedBranchResult.success, true);
assert.equal(protectedHeaders[0]["X-API-Key"], "test-catalogue-key");
assert.equal(protectedHeaders[0]["X-Vercel-Protection-Bypass"], "test-protection-secret");
const otherHeaders = [];
const otherAdapter = createTotalToolsPosReadAdapter({
  baseUrl: "https://private-pos.example.org",
  apiKey: "test-catalogue-key",
  deploymentProtectionBypass: "must-not-be-forwarded",
  fetchImpl: async (_url, init) => {
    otherHeaders.push(init.headers);
    return { ok: true, json: async () => [] };
  },
});
await otherAdapter.listBranches({
  providerId: "total-tools-pos", businessAccountId: "test-account", requestId: "test-request",
});
assert.equal(otherHeaders[0]["X-Vercel-Protection-Bypass"], undefined,
  "a POS protection bypass must not be leaked to an unrelated host");
for (const source of [runtimeConfig, viteConfig]) {
  assert.equal(source.includes("SMARTCOMMERCE_TOTAL_TOOLS_POS_VERCEL_BYPASS_SECRET"), true,
    "the protection bypass is supplied only by server-side environment");
}
const context = { providerId: "total-tools-pos", businessAccountId: "test-account", requestId: "test-request" };

function makeAdapter(payload) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return { ok: true, json: async () => payload };
  };
  return { adapter: createTotalToolsPosReadAdapter({ baseUrl: "https://pos.example.invalid", fetchImpl }), calls };
}

async function inventoryFor(payload, branchId = "branch-A") {
  const { adapter, calls } = makeAdapter(payload);
  const result = await adapter.getInventoryAvailability(context, { productId: "101", branchId });
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0]).pathname, "/api/products/101");
  assert.equal(new URL(calls[0]).searchParams.get("branch_id"), branchId);
  return result;
}

const base = { id: "101", name: "Chain brake", stock_qty: 35, available_qty: 35, min_stock: 1 };
let result = await inventoryFor({ ...base, branch_stock_qty: 0, branch_min_stock: 3 });
assert.equal(result.success, true);
assert.equal(result.data[0].status, "out_of_stock", "global available_qty must not override zero stock at the selected branch");
assert.equal(result.data[0].quantityAvailable, 0);

result = await inventoryFor({ ...base, branch_stock_qty: 2, branch_min_stock: 3 });
assert.equal(result.data[0].status, "low_stock", "branch-specific minimum governs low stock");
assert.equal(result.data[0].quantityOnHand, 2);

result = await inventoryFor({ ...base, branch_stock_qty: 8, branch_min_stock: 3 });
assert.equal(result.data[0].status, "in_stock");
assert.equal(result.data[0].quantityAvailable, 8);

result = await inventoryFor(base);
assert.equal(result.data[0].status, "unknown", "unscoped global quantities cannot be presented as branch stock");
assert.equal(result.data[0].quantityOnHand, undefined);
assert.equal(result.data[0].quantityAvailable, undefined);

result = await inventoryFor({ data: { ...base, branch_stock_qty: 1, branch_min_stock: 2 } });
assert.equal(result.data[0].status, "low_stock", "wrapped POS product payload is supported");

result = await inventoryFor({ ...base, id: "999", branch_stock_qty: 4 });
assert.equal(result.success, false, "incorrect direct-lookup product identity fails closed");
assert.equal(result.error.code, "INVENTORY_PRODUCT_NOT_FOUND");

result = await inventoryFor({ ...base, branch_id: "branch-B", branch_stock_qty: 4 });
assert.equal(result.success, false, "another branch's stock is never accepted");
assert.equal(result.error.code, "INVENTORY_BRANCH_MISMATCH");

result = await inventoryFor(base, undefined);
assert.equal(result.data[0].status, "unknown"); // default branch-A when omitted
const { adapter: globalAdapter } = makeAdapter(base);
const globalResult = await globalAdapter.getInventoryAvailability(context, { productId: "101" });
assert.equal(globalResult.data[0].status, "in_stock", "unscoped inventory may legitimately use aggregate quantities");

const { adapter: productsAdapter } = makeAdapter({
  products: [{ id: "101", name: "Chain brake", brand_name: "STIHL", manufacturer_part_number: "1135 160 5400", model_number: "MS 362", product_type: "spare" }],
});
const products = await productsAdapter.searchProducts(context, {});
assert.equal(products.success, true);
const commerce = products.data.items[0];
assert.equal(commerce.attributes.Brand, "STIHL");
assert.equal(commerce.attributes["Manufacturer Part Number"], "1135 160 5400");
assert.equal(commerce.attributes.Model, undefined, "the spare part's own model is not compatibility evidence");
assert.equal(commerce.active, true, "published POS spare parts remain active");

const { adapter: restrictedAdapter } = makeAdapter({
  products: [
    { id: "201", name: "Rental chainsaw", is_rental: 1, active: 1, online_available: 1, price: 500 },
    { id: "202", name: "Service", is_service: 1, active: 1, online_available: 1, price: 250 },
    { id: "203", name: "Hidden stock", active: 1, online_available: 0, price: 100 },
  ],
});
const restricted = await restrictedAdapter.searchProducts(context, {});
assert.equal(restricted.success, true);
assert.equal(restricted.data.items[0].purchasable, false, "rental-only POS records cannot be purchased as ordinary products");
assert.equal(restricted.data.items[0].rentable, true);
assert.equal(restricted.data.items[1].purchasable, false, "POS service records cannot show normal retail purchase");
assert.equal(restricted.data.items[2].active, false, "POS unpublished items must not be marked as active commerce products");

// Direct POS detail reads must verify product identity; do not silently
// substitute an unrelated record or search after an authorization failure.
async function productDetailScenario(directPayload, directStatus = 200, searchPayload = []) {
  const calls = [];
  const adapter = createTotalToolsPosReadAdapter({
    baseUrl: "https://pos.example.invalid",
    fetchImpl: async url => {
      const pathname = new URL(url).pathname;
      calls.push(pathname);
      return pathname === "/api/products/101"
        ? {ok: directStatus === 200, status: directStatus, statusText: "POS response", json: async () => directPayload}
        : {ok: true, status: 200, json: async () => searchPayload};
    },
  });
  return {result: await adapter.getProductById(context, "101"), calls};
}
let detail = await productDetailScenario({id: "101", name: "Brake"});
assert.equal(detail.result.success, true);
assert.equal(detail.result.data.id, "101");
assert.deepEqual(detail.calls, ["/api/products/101"]);
detail = await productDetailScenario({product: {id: "101", name: "Brake"}});
assert.equal(detail.result.success, true, "wrapped exact POS product is recognized");
detail = await productDetailScenario({id: "999", name: "Wrong part"});
assert.equal(detail.result.success, false);
assert.equal(detail.result.error.code, "PRODUCT_ID_MISMATCH");
assert.deepEqual(detail.calls, ["/api/products/101"], "mismatched direct lookup cannot trigger fallback search");
detail = await productDetailScenario({error: "Forbidden"}, 403);
assert.equal(detail.result.success, false);
assert.equal(detail.result.error.code, "TOTAL_TOOLS_POS_HTTP_403");
assert.deepEqual(detail.calls, ["/api/products/101"], "authorization denial must not retry through search");
detail = await productDetailScenario({error: "Not found"}, 404, [
  {id: "999", name: "Unrelated result"},
  {id: "101", name: "Exact fallback"},
]);
assert.equal(detail.result.success, true, "404 permits legacy exact-ID fallback");
assert.equal(detail.result.data.id, "101");
assert.deepEqual(detail.calls, ["/api/products/101", "/api/products"]);
detail = await productDetailScenario({error: "Not found"}, 404, [{id: "999", name: "Wrong"}]);
assert.equal(detail.result.success, false, "fuzzy matches cannot impersonate the requested product");
assert.equal(detail.result.error.code, "PRODUCT_NOT_FOUND");

const references = [{
  brand: "STIHL", equipmentType: "Chainsaws", model: "MS 362",
  parts: [{ name: "Chain brake", partNumber: "1135 160 5400", assembly: "Chain Brake" }],
}];
function part(id, brand, mpn, sku = id) {
  return { id, name: "Chain brake", sku, brand, category: "Parts", tags: [],
    specs: { Brand: brand, ...(mpn ? { "Manufacturer Part Number": mpn } : {}) } };
}
let fitment = buildPartsFitmentIndex([part("1", "STIHL", "1135 160 5400")], references);
assert.equal(fitment.models[0].parts[0].product?.id, "1", "one exact OEM/brand match enriches governed reference fitment");
fitment = buildPartsFitmentIndex([
  part("1", "STIHL", "1135 160 5400"),
  part("2", "STIHL", "1135 160 5400"),
], references);
assert.equal(fitment.models[0].parts[0].product, undefined, "ambiguous OEM claims must fail closed");
fitment = buildPartsFitmentIndex([part("3", "Other", "1135 160 5400")], references);
assert.equal(fitment.models[0].parts[0].product, undefined, "cross-brand OEM collisions must not match");
fitment = buildPartsFitmentIndex([part("4", "STIHL", undefined, "1135 160 5400")], references);
assert.equal(fitment.models[0].parts[0].product, undefined, "SKU alone is not governed OEM identity");

console.log("POS OEM mapping and branch inventory runtime regressions passed (41 checks).");
