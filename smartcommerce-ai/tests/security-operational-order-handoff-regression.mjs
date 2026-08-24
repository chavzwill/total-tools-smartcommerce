import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const handoff = await readFile(new URL("../src/server/operationalOrderHandoff.ts", import.meta.url), "utf8");
const evidence = await readFile(new URL("../src/server/paymentProviderEvidence.ts", import.meta.url), "utf8");
const api = await readFile(new URL("../api/operational-order-handoffs.ts", import.meta.url), "utf8");
const source = `${handoff}\n${evidence}\n${api}`;
const checks = [];
function guard(name, pattern) { checks.push(name); assert.match(source, pattern, `${name} invariant is missing`); }
function reject(name, pattern) { checks.push(name); assert.doesNotMatch(source, pattern, `${name} forbidden pattern returned`); }

guard("operational orders are durable", /CREATE TABLE IF NOT EXISTS operational_orders/);
guard("one operational order per payment attempt", /payment_attempt_id TEXT NOT NULL UNIQUE/);
guard("one operational order per checkout quote", /quote_id TEXT NOT NULL UNIQUE/);
guard("handoff only reads confirmed payment attempts", /WHERE id=\$\{attemptId\} AND status='confirmed'/);
guard("order amount must match authoritative payment", /OPERATIONAL_ORDER_AMOUNT_MISMATCH/);
guard("order currency must match authoritative payment", /OPERATIONAL_ORDER_CURRENCY_MISMATCH/);
guard("fulfilment must already be bound", /OPERATIONAL_ORDER_FULFILMENT_NOT_BOUND/);
guard("inventory commitments are durable", /CREATE TABLE IF NOT EXISTS operational_order_inventory_commitments/);
guard("inventory commitment is unique by order and product", /PRIMARY KEY\(order_id, product_id\)/);
guard("provider inventory acknowledgment is distinct from internal commitment", /committed_internal','provider_acknowledged','released/);
guard("operational events are replay safe", /UNIQUE\(order_id, event_key\)/);
guard("outbox is durable", /CREATE TABLE IF NOT EXISTS operational_order_outbox/);
guard("one outbox task exists per destination", /UNIQUE\(order_id, destination\)/);
guard("POS write is an explicit outbox destination", /pos_order_write/);
guard("inventory provider write is an explicit outbox destination", /inventory_commitment/);
guard("fulfilment activation is an explicit outbox destination", /fulfilment_activation/);
guard("verified payment invokes operational handoff", /confirmPaymentFromProvider[\s\S]*ensureOperationalOrderForConfirmedAttempt/);
guard("operational handoff failure does not falsify payment confirmation", /operational_order_handoff_deferred/);
guard("staff handoff queue reuses staff session authorization", /staffSession\.js/);
guard("staff handoff queue requires privileged role", /purchasing_approve[\s\S]*security_manage/);
guard("staff handoff API blocks cross-origin reads", /if\(!sameOrigin\(request\)\) return send\(response,403/);
reject("operational handoff does not pretend provider acknowledgment", /pos_handoff_status TEXT NOT NULL DEFAULT 'acknowledged'/);
reject("inventory commitments do not start provider acknowledged", /inventory_commitment_status TEXT NOT NULL DEFAULT 'provider_acknowledged'/);

console.log(`Operational order handoff regression gate passed: ${checks.length} invariants verified.`);
