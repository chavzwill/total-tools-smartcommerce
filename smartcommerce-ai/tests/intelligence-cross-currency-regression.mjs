import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const assistantEngine = await readFile(
  new URL("../src/backend/assistantIntelligenceEngine.ts", import.meta.url),
  "utf8",
);

const invariants = [
  [
    "cheapest ranking carries price currency with the numeric value",
    "type ComparablePrice",
  ],
  [
    "products with mixed provider pricing currencies are excluded from numeric cheapest ranking",
    "if (currencies.size !== 1) return undefined",
  ],
  [
    "two products are numerically price-ranked only when their currencies match",
    "a.price.currency === b.price.currency",
  ],
];

for (const [description, fragment] of invariants) {
  assert.ok(
    assistantEngine.includes(fragment),
    `Missing currency-safe recommendation invariant: ${description}`,
  );
}

console.log(`Currency-safe intelligence regression gate passed (${invariants.length} invariants).`);
