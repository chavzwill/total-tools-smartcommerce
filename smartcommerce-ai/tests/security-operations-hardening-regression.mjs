import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const gateway = await readFile(new URL("../api/operations/[...path].ts", import.meta.url), "utf8");
const idempotency = await readFile(new URL("../src/server/operationsMutationIdempotency.ts", import.meta.url), "utf8");
const recovery = await readFile(new URL("../api/operations-recovery.ts", import.meta.url), "utf8");
const recoveryStore = await readFile(new URL("../src/server/operationsRecovery.ts", import.meta.url), "utf8");

assert.match(gateway, /IDEMPOTENCY_KEY_REQUIRED/, "Operations writes must require idempotency keys");
assert.match(gateway, /STAFF_BRANCH_SCOPE_DENIED/, "Operations gateway must enforce signed staff branch scope");
assert.match(gateway, /markOperationsMutationUncertain/, "Gateway must preserve uncertain upstream outcomes");
assert.match(idempotency, /staff_operations_mutation_outcome_uncertain/, "Uncertain mutations must be audited");
assert.match(idempotency, /staff_operations_mutation_replayed/, "Idempotent replays must be audited");
assert.match(recovery, /security_manage/, "Recovery resolution must require security-management authority");
assert.match(recovery, /confirm_committed/, "Recovery must support confirmed committed outcomes");
assert.match(recovery, /release_retry/, "Recovery must support supervised retry release");
assert.match(recoveryStore, /recovery_note/, "Recovery decisions must persist an audit note");
assert.match(recoveryStore, /confirmed_committed/, "Confirmed committed recovery must keep the duplicate barrier closed");
assert.match(recoveryStore, /staff_operations_recovery_retry_released/, "Retry release must create security audit evidence");

console.log("Operations hardening regression gate passed.");
