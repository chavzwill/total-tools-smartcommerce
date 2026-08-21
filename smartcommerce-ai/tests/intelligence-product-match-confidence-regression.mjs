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
  [engine.includes("confidence") && engine.includes("sort((a, b) => b.confidence - a.confidence"), "internal confidence score remains available for candidate ranking"],
  [engine.includes("needsClarification") && engine.includes("top.confidence < 0.64"), "clarification still depends on conservative evidence thresholds"],
];

for (const [ok, label] of invariants) assert.equal(ok, true, label);
console.log(`Product Match confidence presentation regression gate passed (${invariants.length} invariants).`);
