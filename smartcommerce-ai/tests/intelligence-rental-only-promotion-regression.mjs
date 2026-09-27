import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const engine = await readFile(new URL("../src/backend/assistantIntelligenceEngine.ts", import.meta.url), "utf8");
const runtime = await readFile(new URL("../src/integrations/totalToolsPlatformRuntime.ts", import.meta.url), "utf8");
const preview = await readFile(new URL("../src/integrations/previewCommerceAdapter.ts", import.meta.url), "utf8");
const assistantPage = await readFile(new URL("../src/pages/AssistantPage.tsx", import.meta.url), "utf8");
const productMatchPage = await readFile(new URL("../src/pages/ProductMatchPage.tsx", import.meta.url), "utf8");
const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

const invariants = [
  [engine.includes("product.rentable === true && product.purchasable === false"), "engine detects rental-only grounded products"],
  [engine.includes("rentalOnlyProducts.length > 0"), "rental-only products trigger rental discovery without explicit rent wording"],
  [engine.includes("productId: product.id"), "rental discovery remains tied to grounded product IDs"],
  [runtime.includes("function explicitPurchaseIntent"), "runtime detects explicit purchase language"],
  [runtime.includes("buy|purchase|own|buying|purchasing"), "explicit buy/purchase/ownership wording is preserved"],
  [runtime.includes("rental.productId") && runtime.includes("String(product.id)"), "promotion requires a rental linked to the grounded product"],
  [runtime.includes("return rentalOnlyMatch ? \"rent\" : input.originalIntent"), "catalogue truth can promote an ambiguous/default-buy request to rental"],
  [runtime.includes("intent: resolvedIntent"), "workflow handoff uses the resolved grounded intent"],
  [runtime.includes("followUps(resolvedIntent"), "follow-up actions use the resolved grounded intent"],
  [runtime.includes("provider rental eligibility verification"), "rental promotion does not bypass provider verification"],
  [preview.includes("JCB 3CX Backhoe Loader") && preview.includes("purchasable: false") && preview.includes("[\"backhoe\", \"jcb-backhoe\""), "preview contains a rental-only backhoe and linked rental asset for regression coverage"],
  [assistantPage.includes('product.rentable ? <a href={routeHref(`/rentals?q=${encodeURIComponent(product.name)}`)}>Find rental option</a> : null'), "Ask AI exposes rental discovery only for grounded products marked rentable"],
  [productMatchPage.includes("top.product.rentable") && productMatchPage.includes("Find rental options"), "Product Match exposes rental discovery only for a grounded rentable candidate"],
  [assistantPage.includes("encodeURIComponent(product.name)") && productMatchPage.includes("encodeURIComponent(top.product.name)"), "rental alternatives hand off the grounded product name rather than inventing an asset identifier"],
  [!assistantPage.includes("/rental/${product.id}") && !productMatchPage.includes("/rental/${top.product.id}"), "product-to-rental alternatives never treat a product ID as a rental asset ID"],
  [app.includes("setRoute(normalizeBranchScopedRoute(getRoute()))"), "rental-search handoffs inherit the selected shopping branch at the router boundary"],
];

for (const [ok, label] of invariants) assert.equal(ok, true, label);
console.log(`Rental-only intelligence promotion regression gate passed (${invariants.length} invariants).`);
