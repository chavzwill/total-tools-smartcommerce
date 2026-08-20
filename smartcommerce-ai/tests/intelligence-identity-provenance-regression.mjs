import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runtime = await readFile(
  new URL("../src/integrations/totalToolsPlatformRuntime.ts", import.meta.url),
  "utf8",
);
const gateway = await readFile(
  new URL("../api/platform/[...path].ts", import.meta.url),
  "utf8",
);

const invariants = [
  [
    "assistant readiness trusts customer identity only with server-trusted actor provenance",
    "const trustedCustomerId = context.actorId && input.customerId",
  ],
  [
    "workflow handoff receives only the trusted customer identity",
    "customerId: trustedCustomerId",
  ],
  [
    "public platform requests strip client-supplied actor identity",
    'normalized === "x-actor-id"',
  ],
];

assert.ok(runtime.includes(invariants[0][1]), `Missing identity provenance invariant: ${invariants[0][0]}`);
assert.ok(runtime.includes(invariants[1][1]), `Missing identity provenance invariant: ${invariants[1][0]}`);
assert.ok(
  gateway.includes(invariants[2][1]) && gateway.includes("!privileged"),
  `Missing identity provenance invariant: ${invariants[2][0]}`,
);

console.log(`Assistant identity provenance regression gate passed (${invariants.length} invariants).`);
