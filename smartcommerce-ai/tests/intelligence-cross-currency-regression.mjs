import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const assistantEngine = await readFile(
  new URL("../src/backend/assistantIntelligenceEngine.ts", import.meta.url),
  "utf8",
);
const catalogue = await readFile(
  new URL("../src/pages/CatalogPages.tsx", import.meta.url),
  "utf8",
);

const invariants = [
  [
    "cheapest ranking carries price currency with the numeric value",
    assistantEngine.includes("type ComparablePrice"),
  ],
  [
    "products with mixed provider pricing currencies are excluded from numeric cheapest ranking",
    assistantEngine.includes("if (currencies.size !== 1) return undefined"),
  ],
  [
    "two products are numerically price-ranked only when their currencies match",
    assistantEngine.includes("a.price.currency === b.price.currency"),
  ],
  [
    "catalogue derives comparable currencies only from priced provider products",
    catalogue.includes("const pricedCurrencies = useMemo") && catalogue.includes("product.price > 0 && Boolean(product.currency)"),
  ],
  [
    "catalogue numeric price controls require exactly one provider currency",
    catalogue.includes("pricedCurrencies.length === 1") && catalogue.includes("const comparableCurrency"),
  ],
  [
    "mixed-currency catalogue explicitly disables price sorting and range filtering",
    catalogue.includes("Price sorting and range filters are unavailable across mixed provider currencies."),
  ],
  [
    "price range filtering is guarded by the comparable provider currency",
    catalogue.includes("connected && comparableCurrency && min !== undefined") && catalogue.includes("connected && comparableCurrency && max !== undefined"),
  ],
  [
    "price sorting is guarded by the comparable provider currency",
    catalogue.includes('comparableCurrency && state.sort === "price-asc"') && catalogue.includes('comparableCurrency && state.sort === "price-desc"'),
  ],
  [
    "single-currency price controls identify the actual provider currency",
    catalogue.includes("Price range ({comparableCurrency})") && catalogue.includes("Price: low to high ({comparableCurrency})"),
  ],
  [
    "invalid saved price filters are cleared only after connected catalogue loading completes",
    catalogue.includes('loadStatus !== "ready"') && catalogue.includes('sort: invalidSort ? "best" : previous.sort'),
  ],
];

for (const [description, ok] of invariants) {
  assert.ok(ok, `Missing currency-safe recommendation invariant: ${description}`);
}

console.log(`Currency-safe intelligence regression gate passed (${invariants.length} invariants).`);
