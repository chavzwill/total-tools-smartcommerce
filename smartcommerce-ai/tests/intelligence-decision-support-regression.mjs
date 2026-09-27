import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const decisionSupport = await readFile(new URL("../src/backend/assistantDecisionSupport.ts", import.meta.url), "utf8");
const runtime = await readFile(new URL("../src/integrations/totalToolsPlatformRuntime.ts", import.meta.url), "utf8");
const backendTypes = await readFile(new URL("../src/backend/platformBackendTypes.ts", import.meta.url), "utf8");
const advisor = await readFile(new URL("../src/lib/advisor.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../src/pages/AssistantPage.tsx", import.meta.url), "utf8");

const invariants = [
  [decisionSupport.includes("buildProductRecommendationEvidence"), "product recommendation evidence is generated"],
  [decisionSupport.includes("buildRentalRecommendationEvidence"), "rental recommendation evidence is generated"],
  [decisionSupport.includes("Matches request terms"), "fit rationale is based on matched request terms"],
  [decisionSupport.includes("Relevant catalogue specification") || decisionSupport.includes("Relevant rental specification"), "catalogue specifications can support rationale"],
  [decisionSupport.includes("Preview catalogue record") && decisionSupport.includes("live branch stock and availability are not verified"), "preview product evidence discloses unverified live stock"],
  [decisionSupport.includes("Preview rental record") && decisionSupport.includes("live branch/date availability is not verified"), "preview rental evidence discloses unverified date/branch availability"],
  [decisionSupport.includes("fitReasons.slice(0, 3)"), "fit reasons are bounded"],
  [decisionSupport.includes("cautions") && decisionSupport.includes("slice(0, 2)"), "verification cautions are bounded"],
  [!decisionSupport.includes("api.openai.com") && !decisionSupport.includes("fetch("), "decision support adds no secondary AI/network call"],
  [backendTypes.includes("AssistantRecommendationEvidence") && backendTypes.includes("recommendationEvidence?: AssistantRecommendationEvidence[]"), "shared assistant result contract can carry evidence without breaking fallback adapters"],
  [runtime.includes("buildProductRecommendationEvidence") && runtime.includes("buildRentalRecommendationEvidence") && runtime.includes("recommendationEvidence"), "Total Tools runtime attaches evidence to grounded results"],
  [advisor.includes("recommendationEvidence: result.data.recommendationEvidence || []"), "advisor preserves evidence from server and safely handles older adapters"],
  [page.includes("Why it fits") && page.includes("<strong>Verify:</strong>"), "assistant UI distinguishes rationale from verification"],
  [page.includes("evidence.fitReasons.slice(0, 2)"), "mobile result cards render concise rationale"],
];

for (const [ok, label] of invariants) assert.equal(ok, true, label);
console.log(`Decision-support intelligence regression gate passed (${invariants.length} invariants).`);
