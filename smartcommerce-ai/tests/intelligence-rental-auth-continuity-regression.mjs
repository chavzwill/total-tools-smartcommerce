import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const rentalPage = await readFile(
  new URL("../src/pages/OperationalRentalDetailPage.tsx", import.meta.url),
  "utf8",
);
const customerAccount = await readFile(
  new URL("../src/lib/customerAccount.ts", import.meta.url),
  "utf8",
);

const invariants = [
  [
    "rental drafts persist extension relationship before account onboarding",
    "extensionOf: extensionOf || undefined",
    rentalPage,
  ],
  [
    "rental detail restores extension relationship from the saved draft",
    'query.get("extensionOf") || savedDraft?.extensionOf || ""',
    rentalPage,
  ],
  [
    "account continuation restores the extension query after sign-in",
    "?extensionOf=${encodeURIComponent(extensionOf)}",
    customerAccount,
  ],
  [
    "provider metadata retains the extension relationship",
    "rental_extension_of: extensionOf || null",
    rentalPage,
  ],
  [
    "customer rental lifecycle retains the extension relationship",
    "extensionOfReservationId: extensionOf || undefined",
    rentalPage,
  ],
];

for (const [description, fragment, source] of invariants) {
  assert.ok(source.includes(fragment), `Missing rental authentication continuity invariant: ${description}`);
}

console.log(`Rental extension authentication continuity regression gate passed (${invariants.length} invariants).`);
