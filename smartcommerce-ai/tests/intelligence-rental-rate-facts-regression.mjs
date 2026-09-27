import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../src/pages/AssistantPage.tsx", import.meta.url), "utf8");
const preview = await readFile(new URL("../src/integrations/previewCommerceAdapter.ts", import.meta.url), "utf8");

const invariants = [
  [page.includes("function rentalRateFacts"), "assistant has a dedicated rental-rate facts renderer"],
  [page.includes("rental.ratePlans || []"), "rental rates come from provider-returned rate plans"],
  [page.includes("plan.dailyRate") && page.includes("plan.weeklyRate") && page.includes("plan.monthlyRate"), "daily weekly and monthly facts are read directly"],
  [page.includes("typeof value === \"number\" && Number.isFinite(value)"), "missing or invalid rates are omitted"],
  [page.includes("Provider rental rates"), "rendered rate strip is explicitly provider-backed"],
  [!page.includes("dailyRate *") && !page.includes("weeklyRate *") && !page.includes("monthlyRate *"), "assistant does not derive one rental rate from another"],
  [!page.includes("dailyRate /") && !page.includes("weeklyRate /") && !page.includes("monthlyRate /"), "assistant does not reverse-calculate rental rates"],
  [preview.includes("dailyRate") && preview.includes("weeklyRate") && preview.includes("monthlyRate") && preview.includes("liveVerified: false"), "preview exposes rate facts while preserving unverified-source metadata"],
];

for (const [ok, label] of invariants) assert.equal(ok, true, label);
console.log(`AI rental-rate facts regression gate passed (${invariants.length} invariants).`);
