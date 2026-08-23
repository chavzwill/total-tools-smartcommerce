import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const gateway = await readFile(new URL("../api/operations/[...path].ts", import.meta.url), "utf8");
const session = await readFile(new URL("../src/server/staffSession.ts", import.meta.url), "utf8");

const requiredGatewayPermissions = [
  "pos_hold",
  "transactions_returns",
  "transactions_refund",
  "purchasing_receive",
  "purchasing_approve",
  "pr_approve",
  "pr_convert",
  "transfers_pickup",
  "transfers_dropoff",
  "quotations_approve",
  "quotations_convert",
  "wo_assign_parts",
  "wo_assess",
  "wo_signoff",
  "wo_technician",
];
for (const permission of requiredGatewayPermissions) {
  assert.match(gateway, new RegExp(`\\b${permission}\\b`), `Operations gateway must preserve specialized permission ${permission}`);
}

assert.match(gateway, /nextStatus === "approved" \? "purchasing_approve" : "purchasing_create"/, "PO approval must not collapse into PO-create authority");
assert.match(gateway, /nextStatus === "approved" \|\| nextStatus === "rejected" \? "pr_approve" : "pr_create"/, "PR approval/rejection must remain separately authorized");
assert.match(gateway, /nextStatus === "accepted" \|\| nextStatus === "declined" \? "quotations_approve" : "quotations_create"/, "quotation decisions must remain separately authorized");
assert.match(gateway, /staff_operations_permission_denied/, "permission denials must remain audited");
assert.match(gateway, /staff_operations_branch_scope_denied/, "branch-scope denials must remain audited");

const requiredParentPermissions = [
  "pos_discounts", "pos_refunds", "pos_void_items", "pos_hold",
  "drawers_open", "drawers_close", "void_transactions",
  "inventory_adjust", "customers_credit", "transactions_refund", "transactions_returns",
  "reports_export", "rentals_checkout", "rentals_returns", "rentals_issue",
  "wo_intake", "wo_assess", "wo_assign_parts", "wo_technician", "wo_signoff",
  "pr_create", "pr_approve", "pr_convert",
  "purchasing_create", "purchasing_approve", "purchasing_receive",
  "transfers_create", "transfers_approve", "transfers_pickup", "transfers_dropoff",
  "quotations_create", "quotations_approve", "quotations_convert",
  "security_manage", "security_assign",
];
for (const permission of requiredParentPermissions) {
  assert.match(session, new RegExp(`${permission}:`), `staffSession parent permission mapping must preserve ${permission}`);
}

console.log(`Operations permission-matrix regression gate passed: ${requiredGatewayPermissions.length + requiredParentPermissions.length} specialized permissions verified.`);
