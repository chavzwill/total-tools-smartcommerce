import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const assistantEngine = await readFile(new URL("../src/backend/assistantIntelligenceEngine.ts", import.meta.url), "utf8");
const comparisonEngine = await readFile(new URL("../src/backend/assistantComparisonEngine.ts", import.meta.url), "utf8");
const backendTypes = await readFile(new URL("../src/backend/platformBackendTypes.ts", import.meta.url), "utf8");
const totalToolsRuntime = await readFile(new URL("../src/integrations/totalToolsPlatformRuntime.ts", import.meta.url), "utf8");
const advisorClient = await readFile(new URL("../src/lib/advisor.ts", import.meta.url), "utf8");
const assistantPage = await readFile(new URL("../src/pages/AssistantPage.tsx", import.meta.url), "utf8");
const repairPage = await readFile(new URL("../src/pages/RepairPage.tsx", import.meta.url), "utf8");
const productMatchEngine = await readFile(new URL("../src/backend/productMatchEngine.ts", import.meta.url), "utf8");
const productMatchClient = await readFile(new URL("../src/lib/productMatch.ts", import.meta.url), "utf8");
const productMatchPage = await readFile(new URL("../src/pages/ProductMatchPage.tsx", import.meta.url), "utf8");
const productMatchApi = await readFile(new URL("../api/product-match.ts", import.meta.url), "utf8");

const assistantRequired = [
  ["structured assistant understanding type exists", "export type AssistantUnderstanding"],
  ["assistant extracts product queries", "productQueries"],
  ["assistant extracts rental queries", "rentalQueries"],
  ["assistant extracts required specifications", "requiredSpecs"],
  ["assistant extracts constraints", "constraints"],
  ["assistant tracks clarification state", "needsClarification"],
  ["assistant uses strict structured output", 'name: "assistant_understanding"'],
  ["assistant prompt forbids fabricated commerce data", "Never invent products, prices, stock, brands, model numbers, branch availability, or technical specifications"],
  ["assistant has deterministic fallback without AI credential", "heuristicUnderstanding"],
  ["assistant performs multiple grounded product searches", 'retryPlatformRead("assistant product search"'],
  ["rental lookup is tied to grounded product IDs", "productId: product.id"],
  ["rental lookup asks for available assets", 'status: "available"'],
  ["assistant bounds conversational history", ".slice(-6)"],
  ["assistant bounds each context turn", ".slice(0, 600)"],
  ["assistant resolves short refinement context", "REFINEMENT_PATTERN"],
  ["assistant verifies branch inventory", 'retryPlatformRead("assistant inventory availability"'],
  ["assistant ranks explicit in-stock state highest", 'status === "in_stock"'],
  ["assistant uses actual pricing for cheapest refinements", 'understanding.pricePreference === "cheapest"'],
  ["assistant tracks per-query job-kit coverage", "type QueryCoverage"],
  ["assistant selects grounded products with query coverage", "selectProductsWithQueryCoverage"],
  ["assistant fills distinct needs before global remainder", "for (const bucket of coverage)"],
  ["assistant keeps each provider search result tied to its query", "queryCoverage.push({ query: uniqueQueries[index], productIds })"],
];

for (const [description, fragment] of assistantRequired) {
  assert.ok(assistantEngine.includes(fragment), `Missing assistant intelligence invariant: ${description}`);
}

const comparisonRequired = [
  ["comparison is deterministic and grounded", "export async function buildGroundedProductComparison"],
  ["comparison uses provider-listed pricing", "pricing.salePrice ?? pricing.listPrice ?? pricing.commercialPrice"],
  ["comparison verifies selected-branch inventory", 'retryPlatformRead("assistant comparison inventory"'],
  ["comparison compares only differing catalogue attributes", "comparableAttributeFacts"],
  ["comparison refuses cross-currency price ranking", "currencies.size === 1"],
  ["comparison states when technical evidence is insufficient", "does not provide enough differing technical attributes"],
];

for (const [description, fragment] of comparisonRequired) {
  assert.ok(comparisonEngine.includes(fragment), `Missing grounded comparison invariant: ${description}`);
}

const handoffRequired = [
  ["assistant contract exposes typed workflow handoff", "export type AssistantWorkflowHandoff"],
  ["workflow handoff reports missing required customer data", "missingFields: string[]"],
  ["rental handoff goes to real rental detail when grounded asset exists", 'href: `/rental/${encodeURIComponent(input.rentalAssetId)}`'],
  ["repair handoff goes to real repair form", 'kind: "repair"'],
  ["commercial handoff goes to real commercial quote form", 'kind: "commercial"'],
  ["handoff always declares more input is required", "requiresMoreInput: true"],
];

for (const [description, fragment] of handoffRequired.slice(0, 2)) {
  assert.ok(backendTypes.includes(fragment), `Missing workflow handoff invariant: ${description}`);
}
for (const [description, fragment] of handoffRequired.slice(2)) {
  assert.ok(totalToolsRuntime.includes(fragment), `Missing workflow handoff invariant: ${description}`);
}

assert.ok(
  backendTypes.includes("export type AssistantConversationTurn") && backendTypes.includes("history?: AssistantConversationTurn[]"),
  "Assistant request contract must support bounded recent conversation context",
);
assert.ok(
  totalToolsRuntime.includes("runGroundedAssistantIntelligence") && totalToolsRuntime.includes("history: input.history"),
  "Configured Total Tools runtime must use the grounded assistant intelligence engine with recent task context",
);
assert.ok(
  totalToolsRuntime.includes("buildGroundedProductComparison") && totalToolsRuntime.includes('grounded.understanding.intent === "compare"'),
  "Compare intent must invoke grounded product comparison reasoning",
);
assert.ok(
  totalToolsRuntime.includes("workflowHandoff: handoff") && !totalToolsRuntime.includes("createRentalReservation(context") && !totalToolsRuntime.includes("createRepairRequest(context") && !totalToolsRuntime.includes("createCommercialQuote(context"),
  "Assistant must return workflow handoff metadata without directly submitting rental, repair, or commercial records",
);
assert.ok(
  totalToolsRuntime.includes("Show me cheaper options") && totalToolsRuntime.includes("Can I rent instead?"),
  "Assistant follow-ups must be natural customer language rather than internal machine action names",
);
assert.ok(
  !advisorClient.includes("VITE_SMARTCOMMERCE_BUSINESS_ID") && !advisorClient.includes("VITE_SMARTCOMMERCE_PROVIDER_ID"),
  "Public assistant client must not depend on browser-supplied provider/business identity",
);
assert.ok(
  advisorClient.includes('const SHOPPING_BRANCH_KEY = "smartcommerce_shopping_branch_v1"') &&
    advisorClient.includes('api.get<Branch[]>("/platform/branches")'),
  "Assistant must resolve the shopper's saved branch to provider branch data",
);
assert.ok(
  advisorClient.includes("workflowHandoff: result.data.workflowHandoff") && assistantPage.includes("response?.workflowHandoff"),
  "Assistant UI must expose the server-grounded workflow handoff",
);
assert.ok(
  assistantPage.includes("it will not submit anything without the required customer details"),
  "Assistant UI must explain that workflow handoff does not auto-submit a transaction",
);
assert.ok(
  advisorClient.includes("history.slice(-6)") && assistantPage.includes("const [history, setHistory]"),
  "Assistant UI/client must carry only bounded recent conversation context",
);
assert.ok(
  repairPage.includes('query.get("issue")') && repairPage.includes("initialContext.issue"),
  "Repair workflow must accept the bounded grounded issue description from assistant handoff",
);

const matchRequired = [
  ["Product Match discounts generic visual words", "const STOPWORDS = new Set"],
  ["Product Match normalizes identifier punctuation", "const compact ="],
  ["Product Match gives explicit weight to SKU/barcode evidence", "Exact catalogue identifier matches"],
  ["Product Match gives explicit weight to model evidence", "Model matches"],
  ["Product Match tracks strong evidence separately", "strongSignals"],
  ["Product Match parallelizes availability verification", "const candidates = await Promise.all"],
  ["Product Match clarifies weak exact-identification evidence", "model/SKU/barcode label"],
  ["Product Match combines bounded prior visual evidence", "combineVisualAnalyses"],
  ["Product Match detects brand conflicts across photos", "brandConflict"],
  ["Product Match detects model conflicts across photos", "modelConflict"],
  ["Product Match penalizes conflicting multi-photo evidence", "conflictPenalty"],
  ["Product Match reports evidence image count", "evidenceImages"],
];

for (const [description, fragment] of matchRequired) {
  assert.ok(productMatchEngine.includes(fragment), `Missing Product Match invariant: ${description}`);
}

assert.ok(
  productMatchClient.includes('const SHOPPING_BRANCH_KEY = "smartcommerce_shopping_branch_v1"') &&
    productMatchClient.includes('fetch("/api/platform/branches"'),
  "Product Match must resolve the shopper's saved branch through server branch data",
);
assert.ok(
  productMatchClient.includes("priorAnalysis?: ProductVisualAnalysis") && productMatchClient.includes("priorAnalysis }),"),
  "Product Match client must send only structured prior analysis for photo refinement",
);
assert.ok(
  productMatchPage.includes("const priorAnalysis = result?.analysis") && productMatchPage.includes("Add another photo"),
  "Product Match UI must refine an existing result with another image instead of silently restarting",
);
assert.ok(
  productMatchPage.includes("result.evidenceImages") && productMatchPage.includes(" combined"),
  "Product Match UI must disclose accumulated image evidence",
);
assert.ok(
  productMatchApi.includes("validatePriorAnalysis") && productMatchApi.includes("JSON.stringify(input).length > 8_000"),
  "Product Match API must bound and validate prior structured evidence",
);
assert.ok(
  !productMatchClient.includes("VITE_SMARTCOMMERCE_BUSINESS_ID") && !productMatchClient.includes("VITE_SMARTCOMMERCE_PROVIDER_ID"),
  "Product Match client must not supply provider/business identity from browser environment variables",
);

console.log(`Grounded intelligence regression gate passed (${assistantRequired.length + comparisonRequired.length + handoffRequired.length + matchRequired.length + 21} invariants).`);