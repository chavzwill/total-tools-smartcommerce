import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const worker = await readFile(new URL("../src/server/operationalOrderOutboxWorker.ts", import.meta.url), "utf8");
const processors = await readFile(new URL("../src/server/operationalOrderProcessors.ts", import.meta.url), "utf8");
const endpoint = await readFile(new URL("../api/operational-order-worker.ts", import.meta.url), "utf8");
const queueApi = await readFile(new URL("../api/operational-order-handoffs.ts", import.meta.url), "utf8");
const source = `${worker}\n${processors}\n${endpoint}\n${queueApi}`;

const checks = [];
function guard(name, pattern) { checks.push(name); assert.match(source, pattern, `${name} invariant is missing`); }
function reject(name, pattern) { checks.push(name); assert.doesNotMatch(source, pattern, `${name} forbidden pattern returned`); }

guard("worker adds lease token", /ADD COLUMN IF NOT EXISTS lease_token TEXT/);
guard("worker adds lease expiry", /ADD COLUMN IF NOT EXISTS lease_until TIMESTAMPTZ/);
guard("claims use skip locked", /FOR UPDATE SKIP LOCKED/);
guard("expired processing leases are reclaimable", /status='processing'[\s\S]*lease_until IS NOT NULL[\s\S]*lease_until <= NOW\(\)/);
guard("claims are destination scoped", /destination = ANY\(\$\{destinations\}::text\[\]\)/);
guard("claim increments attempts", /attempts=q\.attempts \+ 1/);
guard("acknowledgement requires external reference", /OPERATIONAL_OUTBOX_ACK_REFERENCE_REQUIRED/);
guard("acknowledgement requires active lease token", /lease_token=\$\{input\.leaseToken\}[\s\S]*lease_until > NOW\(\)/);
guard("retry returns job to pending", /SET status='pending'[\s\S]*next_attempt_at=NOW\(\)/);
guard("retry backoff is bounded", /Math\.min\(3600, 15 \* 2 \*\* exponent\)/);
guard("retry attempts are bounded", /DEFAULT_MAX_ATTEMPTS = 8/);
guard("terminal failures are durable", /SET status='failed'[\s\S]*failed_at=NOW\(\)/);
guard("pos acknowledgement updates order reference", /pos_handoff_status='acknowledged'[\s\S]*pos_order_reference=\$\{externalReference\}/);
guard("inventory acknowledgement updates commitments", /status='provider_acknowledged'/);
guard("fulfilment activation is internally processable", /fulfilment_activation[\s\S]*outcome: "acknowledged"/);
guard("pos work is feature gated", /SMARTCOMMERCE_POS_ORDER_WRITE_ENABLED/);
guard("inventory provider work is feature gated", /SMARTCOMMERCE_PROVIDER_INVENTORY_COMMIT_ENABLED/);
guard("worker endpoint requires server secret", /SMARTCOMMERCE_WORKER_SECRET/);
guard("worker endpoint uses timing safe comparison", /timingSafeEqual/);
guard("worker endpoint refuses missing configuration", /WORKER_NOT_CONFIGURED/);
guard("operations queue exposes reclaimable work", /reclaimable_handoffs/);
guard("operations queue exposes terminal failures", /failed_handoffs/);
reject("worker endpoint does not accept staff cookie auth", /STAFF_COOKIE_NAME|readStaffSession|canStaff/);
reject("provider-disabled destinations are not default-processable", /const destinations:[\s\S]*\["fulfilment_activation",\s*"pos_order_write"/);

console.log(`Operational outbox worker regression gate passed: ${checks.length} invariants verified.`);
