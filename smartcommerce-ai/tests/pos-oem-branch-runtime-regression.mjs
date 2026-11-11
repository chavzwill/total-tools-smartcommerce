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

console.log("POS OEM mapping and branch inventory runtime regressions passed (23 checks).");
