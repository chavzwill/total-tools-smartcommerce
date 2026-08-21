import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../src/pages/ProductDetailPage.tsx", import.meta.url), "utf8");

const invariants = [
  [page.includes('from "../lib/shoppingBranch"'), "Product Detail consumes shared shopping branch state"],
  [!page.includes('const SHOPPING_BRANCH_KEY = "smartcommerce_shopping_branch_v1"'), "Product Detail no longer duplicates the shopping-branch storage key"],
  [page.includes("getShoppingBranch") && page.includes("SHOPPING_BRANCH_CHANGED_EVENT") && page.includes("isShoppingBranch"), "Product Detail initializes from and reacts to validated global branch changes"],
  [page.includes('api.get<Branch[]>("/platform/branches")'), "Product Detail resolves the selected shopper branch against provider branch data"],
  [page.includes("/platform/inventory/availability?productId=") && page.includes("branchId=") && page.includes("quantity=1"), "Product Detail requests provider inventory for the grounded product and selected branch"],
  [page.includes('lookupStatus: "unavailable"') && page.includes("availability not confirmed"), "provider inventory failures remain availability-unconfirmed rather than out-of-stock"],
  [page.includes("providerRecordIsVerified") && page.includes('record?.metadata?.liveVerified !== false') && page.includes('record?.metadata?.source !== "preview_catalogue"'), "preview/unverified inventory cannot masquerade as provider-confirmed stock"],
  [page.includes('record.status === "out_of_stock"') && page.includes("Out of stock at ${branch}"), "explicit verified provider out-of-stock blocks immediate purchase"],
  [page.includes("quantity > record.quantityAvailable") && page.includes("Only ${record.quantityAvailable} provider-listed at ${branch}"), "requested quantity cannot exceed an explicit provider-listed available count"],
  [page.includes("if (branch === \"Online\" || availability.lookupStatus !== \"confirmed\") return undefined"), "Online and unconfirmed inventory do not create a false purchase block"],
  [page.includes("disabled={Boolean(blockReason)}") && page.includes("if (!blockReason) onAdd(product.id, quantity)"), "cart submission is guarded by the grounded detail availability decision"],
  [page.includes("Choose a branch to confirm live pickup stock"), "Online context clearly asks for branch selection instead of fabricating branch stock"],
  [page.includes("api.get<CommerceProduct>(`/platform/products/${encodeURIComponent(product.id)}`)"), "Product Detail fetches the grounded provider product instead of trusting mapped snapshot pricing"],
  [page.includes("const value = price.metadata?.branchId") && page.includes("pricingBranchId(price) === branchId"), "branch-specific provider price selection uses the provider pricing metadata contract"],
  [page.includes("const unboundPrice = pricing.find((price) => pricingBranchId(price) === undefined)") && page.includes("const selected = branchPrice || unboundPrice"), "provider pricing may fall back only to an explicitly unbound provider price"],
  [!page.includes("branchPrice || unboundPrice || pricing[0]") && !page.includes("branchPrice || fallbackPrice || pricing[0]"), "Product Detail never falls back to an arbitrary potentially different-branch price"],
  [page.includes("const amount = selected.salePrice ?? selected.listPrice") && !page.includes("selected.commercialPrice"), "retail Product Detail price uses provider sale/list pricing and does not expose commercial pricing as retail fallback"],
  [page.includes("providerPriceText(providerProduct, priceLookupStatus, availability.branchId)"), "connected Product Detail display price is derived from provider product and resolved branch context"],
  [page.includes('status !== "confirmed"') && page.includes('return "Price unavailable"'), "failed provider price lookup fails closed as price unavailable"],
];

for (const [ok, label] of invariants) assert.equal(ok, true, label);
console.log(`Product-detail availability regression gate passed (${invariants.length} invariants).`);
