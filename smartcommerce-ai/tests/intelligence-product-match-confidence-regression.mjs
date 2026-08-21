import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../src/pages/ProductMatchPage.tsx", import.meta.url), "utf8");
const engine = await readFile(new URL("../src/backend/productMatchEngine.ts", import.meta.url), "utf8");

const invariants = [
  [page.includes("Strong catalogue evidence"), "strong evidence is presented qualitatively"],
  [page.includes("Good catalogue evidence"), "good evidence is presented qualitatively"],
  [page.includes("Possible catalogue evidence"), "possible evidence is presented qualitatively"],
  [page.includes("Needs another clue"), "clarification state is explicit"],
  [page.includes("High evidence") && page.includes("Moderate evidence") && page.includes("Limited evidence"), "candidate evidence strength uses qualitative ranges"],
  [!page.includes("% match score"), "top candidate does not expose pseudo-precise percentage score"],
  [!page.includes("% match</strong>"), "alternative candidates do not expose pseudo-precise percentage score"],
  [page.includes("productMatchAdvisorPrompt"), "Product Match creates a bounded grounded AI handoff"],
  [page.includes("Do not claim you can see or re-analyze the original photo"), "AI handoff explicitly forbids pretending to re-see the photo"],
  [page.includes("Supplied visual clues") && page.includes("Why Product Match ranked it"), "AI handoff carries visual-analysis evidence and ranking reasons"],
  [page.includes("Ask AI about this match"), "customer CTA accurately describes the AI handoff"],
  [!page.includes("Ask AI to verify"), "customer CTA no longer overstates independent image verification"],
  [page.includes("slice(0, 2200)"), "Product Match AI handoff is length bounded"],
  [engine.includes("confidence") && engine.includes("sort((a, b) => b.confidence - a.confidence"), "internal confidence score remains available for candidate ranking"],
  [engine.includes("needsClarification") && engine.includes("top.confidence < 0.64"), "clarification still depends on conservative evidence thresholds"],
];

for (const [ok, label] of invariants) assert.equal(ok, true, label);
console.log(`Product Match confidence and AI-handoff regression gate passed (${invariants.length} invariants).`);
