import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const commercialPage = await readFile(
  new URL("../src/pages/CommercialPage.tsx", import.meta.url),
  "utf8",
);

const invariants = [
  [
    "commercial drafts preserve grounded assistant item metadata through account onboarding",
    "handoffItem: requestContext.item || undefined",
  ],
  [
    "commercial drafts preserve grounded assistant quantity through account onboarding",
    "handoffQuantity: requestContext.quantity",
  ],
  [
    "commercial drafts preserve assistant request context separately from editable form text",
    "handoffDetails: requestContext.details || undefined",
  ],
  [
    "commercial drafts preserve assistant mode and branch through account onboarding",
    "handoffMode: requestContext.mode || undefined",
  ],
  [
    "commercial route context falls back to saved grounded item after sign-in",
    "routeContext.item || boundedHandoffText(savedDraft.handoffItem",
  ],
  [
    "commercial route context falls back to saved grounded quantity after sign-in",
    "routeContext.quantity ?? boundedHandoffQuantity(savedDraft.handoffQuantity)",
  ],
  [
    "provider submission still uses restored grounded item metadata",
    "requestedItems: requestContext.item",
  ],
];

for (const [description, fragment] of invariants) {
  assert.ok(
    commercialPage.includes(fragment),
    `Missing commercial authentication continuity invariant: ${description}`,
  );
}

console.log(`Commercial AI authentication continuity regression gate passed (${invariants.length} invariants).`);
