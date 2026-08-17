import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const load = async (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

const app = await load("src/App.tsx");
const home = await load("src/pages/HomePageV3.tsx");
const commerceSections = await load("src/components/home/CommerceSections.tsx");

const checks = [];
function guard(name, source, pattern, message) {
  checks.push(name);
  assert.match(source, pattern, message || `${name} storefront invariant is missing`);
}
function reject(name, source, pattern, message) {
  checks.push(name);
  assert.doesNotMatch(source, pattern, message || `${name} forbidden regression returned`);
}

// Core customer journeys must remain wired to operational surfaces.
guard("products route", app, /path === "\/products"[\s\S]*?<ProductsPage/);
guard("product detail route", app, /path\.startsWith\("\/product\/"\)[\s\S]*?<ProductDetailPage/);
guard("compare route", app, /path === "\/compare"[\s\S]*?<ComparePage/);
guard("rentals route", app, /path === "\/rentals"[\s\S]*?<RentalsPage/);
guard("operational rental detail route", app, /path\.startsWith\("\/rental\/"\)[\s\S]*?<OperationalRentalDetailPage/);
guard("repairs route", app, /path === "\/repairs"[\s\S]*?<RepairPage/);
guard("commercial route", app, /path === "\/commercial"[\s\S]*?<CommercialPage/);
guard("assistant route", app, /path === "\/assistant"[\s\S]*?<AssistantPage/);
guard("product match route", app, /path === "\/product-match"[\s\S]*?<ProductMatchPage/);
guard("cart route", app, /path === "\/cart"[\s\S]*?<CartPage/);
guard("checkout route", app, /path === "\/checkout"[\s\S]*?<CheckoutPage/);

// Guest cart must persist quantities and clamp invalid values.
guard("guest cart storage key", app, /smartcommerce_guest_cart_v1/);
guard("guest cart quantity validation", app, /Number\.isInteger\(item\.quantity\)[\s\S]*?item\.quantity > 0[\s\S]*?item\.quantity <= 999/);
guard("guest cart local persistence", app, /localStorage\.setItem\(GUEST_CART_KEY, JSON\.stringify\(cart\)\)/);
guard("guest add fallback on unauthenticated response", app, /error\?\.status === 401[\s\S]*?setCart/);

// Confirmation pages must consume real workflow metadata instead of fixed fake-success values.
guard("order confirmation metadata", app, /type="order"[\s\S]*?reference=\{route\.query\.get\("ref"\)[\s\S]*?status=\{route\.query\.get\("status"\)/);
guard("rental confirmation metadata", app, /type="rental"[\s\S]*?reference=\{route\.query\.get\("ref"\)[\s\S]*?status=\{route\.query\.get\("status"\)/);
guard("repair confirmation metadata", app, /type="repair"[\s\S]*?reference=\{route\.query\.get\("ref"\)[\s\S]*?status=\{route\.query\.get\("status"\)/);
guard("commercial confirmation metadata", app, /type="commercial"[\s\S]*?reference=\{route\.query\.get\("ref"\)[\s\S]*?status=\{route\.query\.get\("status"\)/);

// Approved homepage baseline must stay compact and must not restore the removed feature-inventory strip.
guard("homepage category cap", home, /categories\.slice\(0, 8\)/);
reject("removed capability strip stays removed", commerceSections, /Total Tools branch locations|SmartCommerce guided discovery|Repair request workflow|Commercial enquiry path/);

console.log(`Storefront stability regression gate passed: ${checks.length} invariants verified.`);
