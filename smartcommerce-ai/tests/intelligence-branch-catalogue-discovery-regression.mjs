import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const loader = await readFile(new URL("../src/lib/branchCatalogue.ts", import.meta.url), "utf8");
const advisor = await readFile(new URL("../src/lib/advisor.ts", import.meta.url), "utf8");
const pages = await readFile(new URL("../src/pages/CatalogPages.tsx", import.meta.url), "utf8");
const tile = await readFile(new URL("../src/components/demo/ProductTile.tsx", import.meta.url), "utf8");
const types = await readFile(new URL("../src/types.ts", import.meta.url), "utf8");

const invariants = [
  [loader.includes('api.get<Branch[]>("/platform/branches")'), "branch catalogue resolves the shopper branch against provider branch data"],
  [loader.includes('`/platform/products${query}`') && loader.includes('branchId=${encodeURIComponent(branchId)}'), "provider product discovery is explicitly scoped by resolved branch ID"],
  [loader.includes('api.get<PlatformPage<ProductCategory>>("/platform/categories")'), "branch catalogue uses provider categories rather than fabricated category labels when available"],
  [loader.includes("INVENTORY_CONCURRENCY = 8") && loader.includes("mapWithConcurrency"), "per-product inventory verification is bounded rather than launched without concurrency control"],
  [loader.includes("/platform/inventory/availability?productId=") && loader.includes("quantity=1"), "catalogue cards attach provider inventory for the grounded product and branch"],
  [loader.includes("pricingBranchId(price) === branchId") && loader.includes("const selected = branchPrice || unboundPrice"), "catalogue price selects only branch-bound or explicitly unbound provider pricing"],
  [!loader.includes("branchPrice || unboundPrice || pricing[0]") && !loader.includes("branchPrice || fallbackPrice || pricing[0]"), "catalogue never falls back to an arbitrary other-branch price"],
  [loader.includes('return records.find((item) => String(item.branchId || "") === branchId);'), "physical-branch catalogue inventory requires an exact returned branch ID match"],
  [!loader.includes('records.find((item) => String(item.branchId || "") === branchId) || records[0]'), "catalogue never borrows another branch inventory record when the requested branch is missing"],
  [loader.includes('result.data.filter((item) => String(item.branchId || "") === branchId)'), "catalogue filters provider inventory responses to the requested physical branch before mapping UI state"],
  [advisor.includes("inventoryRecordsForBranch") && advisor.includes('records.filter((item) => String(item.branchId || "") === branchId)'), "Ask AI availability snapshots retain only exact requested-branch inventory records"],
  [!advisor.includes('records.find((item) => String(item.branchId || "") === branchId) || records[0]'), "Ask AI never substitutes the first unrelated inventory record for the selected branch"],
  [loader.includes('record?.metadata?.liveVerified !== false') && loader.includes('record?.metadata?.source !== "preview_catalogue"'), "preview/unverified inventory cannot masquerade as live catalogue stock"],
  [loader.includes("availability not confirmed") && loader.includes("live stock not verified"), "failed and unverified inventory remain distinct from explicit out-of-stock"],
  [loader.includes('product.purchasable === false') && loader.includes('"Rental only"') && loader.includes('"Not available for purchase"'), "provider non-purchasable products cannot expose a normal purchase action"],
  [loader.includes('record.status === "out_of_stock"') && loader.includes("Out of stock at ${branchName}"), "verified provider out-of-stock creates a grounded catalogue purchase block"],
  [types.includes("currency?: string") && types.includes("purchasable?: boolean") && types.includes("purchaseBlockedReason?: string"), "Product UI contract carries provider-grounded currency and purchase action state"],
  [tile.includes("product.currency || \"JMD\"") && tile.includes("Intl.NumberFormat"), "connected catalogue cards render the provider currency rather than assuming JMD"],
  [tile.includes("disabled={Boolean(purchaseBlockedReason)}") && tile.includes("if (!purchaseBlockedReason) onAdd(product.id)"), "catalogue Add to Cart respects the grounded purchase block"],
  [pages.includes('from "../lib/branchCatalogue"') && pages.includes("loadBranchCatalogue(branch)"), "connected product discovery loads through the branch-scoped catalogue adapter"],
  [pages.includes("getShoppingBranch()"), "catalogue retrieval uses the shared global shopping branch"],
  [pages.includes("branches: splitList(params.get(\"branch\"))") && pages.includes('params.set("branch", state.branches.join(","))'), "route branch context is preserved in catalogue URL state"],
  [!pages.includes("product.stockStatus.toLowerCase().includes(branch.toLowerCase())"), "branch context is never implemented as a stock-label text filter"],
  [!pages.includes("const branchOptions") && !pages.includes("<legend>Branch</legend>"), "catalogue no longer exposes a competing branch checkbox selector"],
  [!pages.includes('...state.branches.map((value) => ["Branch", value]'), "global branch context is not misrepresented as a removable catalogue filter chip"],
  [pages.includes("branches: previous.branches"), "Clear filters preserves the selected global branch context"],
  [pages.includes("products: []") && pages.includes('status: "error"') && pages.includes("Connected catalogue could not be loaded."), "provider catalogue failure fails closed instead of retaining stale products from another branch"],
  [pages.includes("Checking the connected catalogue…") && pages.includes("loadStatus === \"loading\""), "connected discovery exposes an explicit loading state instead of briefly presenting stale branch results"],
  [pages.includes("const catalogue = useGroundedCatalogue()") && pages.includes("ProductsPage") && pages.includes("SearchPage") && pages.includes("CategoryPage"), "Products, Search and Category share the grounded branch catalogue flow"],
];

for (const [ok, label] of invariants) assert.equal(ok, true, label);
console.log(`Branch catalogue discovery regression gate passed (${invariants.length} invariants).`);