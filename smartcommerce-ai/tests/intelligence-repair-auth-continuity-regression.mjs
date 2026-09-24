import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const repairPage = await readFile(
  new URL("../src/pages/RepairPage.tsx", import.meta.url),
  "utf8",
);

const invariants = [
  [
    "fresh AI equipment context wins over a stale saved repair draft",
    "initialContext.equipment || savedDraft.equipment || \"\"",
  ],
  [
    "fresh AI issue context wins over a stale saved repair draft",
    "initialContext.issue || savedDraft.issue || \"\"",
  ],
  [
    "repair draft persists the resolved equipment and issue before account onboarding",
    "const draft: RepairDraft = { equipment, model, issue, branch, date, contact }",
  ],
  [
    "signed-out repair submission saves the resolved draft before redirecting to account onboarding",
    "saveDraft();\n        go(\"/account?intent=repair\")",
  ],
  [
    "provider submission uses the resolved repair equipment and issue",
    "equipmentName: equipment",
  ],
];

for (const [description, fragment] of invariants) {
  assert.ok(
    repairPage.replace(/\r\n/g, "\n").includes(fragment),
    `Missing repair authentication continuity invariant: ${description}`,
  );
}

console.log(`Repair AI authentication continuity regression gate passed (${invariants.length} invariants).`);
