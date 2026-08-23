import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const intake = await readFile(new URL("../src/server/omnichannelIntake.ts", import.meta.url), "utf8");
const outcomes = await readFile(new URL("../src/server/omnichannelOutcomeSync.ts", import.meta.url), "utf8");
const notifications = await readFile(new URL("../src/server/exceptionNotifications.ts", import.meta.url), "utf8");
const mutations = await readFile(new URL("../src/server/operationsMutationIdempotency.ts", import.meta.url), "utf8");

assert.match(intake, /omnichannel_events_occurred_idx[\s\S]*occurred_at DESC/, "cross-channel date reports need a date-leading event index");
assert.match(intake, /omnichannel_intake_received_idx[\s\S]*received_at DESC/, "intake date reports need a date-leading index");
assert.match(intake, /omnichannel_intake_customer_date_idx/, "customer activity lookups need a customer/date index");
assert.match(intake, /omnichannel_intake_branch_date_idx/, "branch activity lookups need a branch/date index");
assert.match(intake, /omnichannel_intake_downstream_ref_idx/, "historical downstream-reference reconciliation needs a targeted index");
assert.match(outcomes, /omnichannel_outcome_retry_idx/, "failed outcome retries need a due-retry partial index");
assert.match(outcomes, /LIMIT \$\{limit\}/, "outcome recovery work must remain bounded");
assert.match(notifications, /WHERE state <> 'resolved'/, "exception synchronization must not load all historical resolved notifications");
assert.match(notifications, /omnichannel_exception_active_detected_idx/, "active exception scans need a partial index");
assert.match(notifications, /omnichannel_exception_resolved_idx/, "recent resolved history needs a targeted partial index");
assert.match(mutations, /operations_mutation_actor_created_idx/, "mutation recovery/audit lookups need an actor/date index");
assert.match(mutations, /operations_mutation_operation_created_idx/, "mutation recovery/audit lookups need an operation/date index");

console.log("Operational ledger performance regression gate passed.");
