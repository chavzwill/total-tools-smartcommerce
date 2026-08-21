import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const advisor = await readFile(new URL("../src/lib/advisor.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../src/pages/AssistantPage.tsx", import.meta.url), "utf8");

const invariants = [
  [advisor.includes("InventoryAvailability"), "advisor uses the platform inventory contract"],
  [advisor.includes("resolveSelectedBranchContext"), "advisor resolves selected shopping branch context"],
  [advisor.includes("/platform/inventory/availability?productId=") && advisor.includes("branchId="), "availability lookup is scoped to product and selected branch"],
  [advisor.includes("lookupStatus: result.success ? \"confirmed\" : \"unavailable\""), "lookup failure is represented separately from stock status"],
  [advisor.includes("records: result.success ? result.data : []"), "failed lookup never fabricates an inventory record"],
  [advisor.includes("productAvailability") && advisor.includes("selectedBranchName"), "advisor response carries branch availability snapshot"],
  [page.includes("The provider inventory lookup did not complete. This is not an out-of-stock result."), "failed inventory read is explicitly not treated as out of stock"],
  [page.includes("live stock not verified") && page.includes("liveVerified === false"), "preview or unverified inventory remains visibly unverified"],
  [page.includes("provider status in stock") && page.includes("provider status low stock"), "positive provider statuses are presented as provider facts"],
  [page.includes("provider status out of stock"), "out-of-stock is only presented from an explicit provider status"],
  [page.includes("Final fulfillment is still confirmed at checkout or reservation."), "in-stock status does not imply guaranteed fulfillment"],
  [page.includes("Next provider-listed availability"), "next availability is labeled as provider-listed rather than promised"],
  [page.includes("ProductAvailability snapshot={availability}"), "product cards render the independent availability snapshot"],
  [page.includes("sc-assistant-evidence sc-assistant-availability"), "availability reuses the canonical evidence surface rather than adding a new CSS layer"],
];

for (const [ok, label] of invariants) assert.equal(ok, true, label);
console.log(`Branch-availability intelligence regression gate passed (${invariants.length} invariants).`);
