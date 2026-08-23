import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const gateway = await readFile(new URL("../api/operations/[...path].ts", import.meta.url), "utf8");
const guards = await readFile(new URL("../src/server/operationsStateGuards.ts", import.meta.url), "utf8");

assert.match(gateway, /validateOperationsState/, "Operations gateway must invoke authoritative state guards");
assert.match(gateway, /staff_operations_state_transition_blocked/, "blocked state transitions must be audited");

assert.match(guards, /INVALID_PR_STATE_TRANSITION/, "purchase-request state sequencing must be enforced");
assert.match(guards, /INVALID_PO_STATE_TRANSITION/, "purchase-order state sequencing must be enforced");
assert.match(guards, /PO_NOT_RECEIVABLE/, "PO receiving must require an approved\/partial PO");
assert.match(guards, /PO_OVER_RECEIPT_BLOCKED/, "PO over-receipt must be blocked");
assert.match(guards, /PO_RECEIVE_ITEM_MISMATCH/, "PO receiving must reject foreign line IDs");
assert.match(guards, /INVALID_QUOTATION_STATE_TRANSITION/, "accepted quotation sourcing side effects must not be replayable by rewinding status");
assert.match(guards, /Accepted quotations must be copied\/reissued/, "material accepted-quote revisions must use the controlled copy/reissue path");
assert.match(guards, /TRANSFER_NOT_DISPATCHABLE/, "transfer dispatch must require pending state");
assert.match(guards, /TRANSFER_NOT_RECEIVABLE/, "transfer receiving must require in-transit state");
assert.match(guards, /TRANSFER_OVER_RECEIPT_BLOCKED/, "transfer over-receipt must be blocked");
assert.match(guards, /TRANSFER_RECEIVE_ITEM_MISMATCH/, "transfer receiving must reject foreign line IDs");
assert.match(guards, /TRANSFER_NOT_CANCELLABLE/, "terminal transfers must not be cancellable");

console.log("Operations workflow state-transition regression gate passed.");
