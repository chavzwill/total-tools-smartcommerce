import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const engine = await readFile(new URL("../src/backend/assistantIntelligenceEngine.ts", import.meta.url), "utf8");
const runtime = await readFile(new URL("../src/integrations/totalToolsPlatformRuntime.ts", import.meta.url), "utf8");
const preview = await readFile(new URL("../src/integrations/previewCommerceAdapter.ts", import.meta.url), "utf8");

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
];

for (const [ok, label] of invariants) assert.equal(ok, true, label);
console.log(`Rental-only intelligence promotion regression gate passed (${invariants.length} invariants).`);
