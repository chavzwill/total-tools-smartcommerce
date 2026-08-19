import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../api/account-sessions.ts", import.meta.url), "utf8");

const checks = [];
function guard(name, pattern, message) {
  checks.push(name);
  assert.match(source, pattern, message || `${name} invariant is missing`);
}
function reject(name, pattern, message) {
  checks.push(name);
  assert.doesNotMatch(source, pattern, message || `${name} forbidden pattern returned`);
}

guard("session management requires live unrevoked session", /customer_sessions[\s\S]*?token_hash=\$\{tokenHash\}[\s\S]*?revoked_at IS NULL[\s\S]*?expires_at>NOW\(\)/);
guard("session mutation requires same origin", /method !== "POST"[\s\S]*?if \(!sameOrigin\(request\)\) return send\(response,403/);
guard("session request bodies are bounded", /const MAX_BODY_BYTES = 8_000[\s\S]*?if \(total > MAX_BODY_BYTES\)/);
guard("session mutation is IP rate limited", /action: "session_management_ip"[\s\S]*?subject: requestIp\(request\)[\s\S]*?limit: 30[\s\S]*?windowSeconds: 900/);
guard("session mutation is account rate limited", /action: "session_management_account"[\s\S]*?subject: current\.customer_id[\s\S]*?limit: 20[\s\S]*?windowSeconds: 900/);
guard("session listing is customer scoped", /FROM customer_sessions WHERE customer_id=\$\{current\.customer_id\} AND revoked_at IS NULL AND expires_at>NOW\(\)/);
guard("single session revoke is customer scoped", /UPDATE customer_sessions SET revoked_at=NOW\(\) WHERE id=\$\{sessionId\} AND customer_id=\$\{current\.customer_id\} AND revoked_at IS NULL RETURNING id/);
guard("current session cannot be revoked through remote revoke action", /!sessionId \|\| sessionId===current\.id/);
guard("revoke others preserves current session", /customer_id=\$\{current\.customer_id\} AND id<>\$\{current\.id\} AND revoked_at IS NULL AND expires_at>NOW\(\)/);
guard("rate limit emits retry after", /status === 429[\s\S]*?Retry-After[\s\S]*?RATE_LIMITED/);
reject("session tokens are never returned in session list", /sessions:rows\.map\([\s\S]*?token_hash/);
reject("session mutation never trusts caller customer id", /body\.customerId|body\.customer_id/);

console.log(`Session management security regression gate passed: ${checks.length} invariants verified.`);
