import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sync = await readFile(new URL("../src/server/omnichannelOutcomeSync.ts", import.meta.url), "utf8");
const api = await readFile(new URL("../api/omnichannel-outcomes.ts", import.meta.url), "utf8");
const panel = await readFile(new URL("../src/components/operations/ManagementExceptionPanel.tsx", import.meta.url), "utf8");

assert.match(sync, /sync_attempt_count INTEGER NOT NULL DEFAULT 0/, "outcome sync failures must have durable attempt counts");
assert.match(sync, /next_retry_at TIMESTAMPTZ/, "outcome sync failures must have durable next-retry times");
assert.match(sync, /RETRY_DELAYS_SECONDS/, "outcome sync retries must use bounded backoff");
assert.match(sync, /last_sync_error=NULL,sync_attempt_count=0,last_sync_attempt_at=NOW\(\),next_retry_at=NULL/, "successful synchronization must clear retry state");
assert.match(sync, /sync_attempt_count=\$\{attempts\}/, "failed synchronization must increment attempt state");
assert.match(sync, /export async function retryFailedOutcomeLinks/, "a due-only synchronization recovery function must exist");
assert.match(sync, /WHERE last_sync_error IS NOT NULL AND \(next_retry_at IS NULL OR next_retry_at <= NOW\(\)\)/, "automatic recovery must retry only due failed reads");
assert.match(sync, /deliberately read-only[\s\S]*must never call the Operations mutation/, "sync recovery must document and preserve the read-only boundary");
assert.doesNotMatch(sync, /\/api\/operations/, "outcome sync recovery must never call the Operations mutation gateway");

assert.match(api, /action === "retry-failures"/, "staff API must expose controlled failed-sync recovery");
assert.match(api, /canStaff\(staff, "reports"\)/, "failed-sync recovery must remain reports-permission gated");
assert.match(api, /omnichannel_outcome_retry_batch/, "failed-sync recovery actions must be audited");
assert.match(panel, /Retry due syncs/, "management exceptions must expose the safe sync recovery action");
assert.match(panel, /uncertain stock\/payment writes stay locked in Operations Recovery/, "UI must explain that business writes are not automatically retried");

console.log("Omnichannel read-only synchronization recovery regression gate passed.");
