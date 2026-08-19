import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const passkeys = await readFile(new URL("../api/account-passkeys.ts", import.meta.url), "utf8");

const checks = [];
function guard(name, pattern, message) {
  checks.push(name);
  assert.match(passkeys, pattern, message || `${name} invariant is missing`);
}
function reject(name, pattern, message) {
  checks.push(name);
  assert.doesNotMatch(passkeys, pattern, message || `${name} forbidden pattern returned`);
}

guard("Passkey endpoint is POST only", /method \|\| ""\)\.toUpperCase\(\) !== "POST"[\s\S]*?METHOD_NOT_ALLOWED/);
guard("Passkey mutations enforce same origin", /if \(!sameOrigin\(request\)\)[\s\S]*?ORIGIN_REJECTED/);
guard("Passkey request bodies are bounded", /const MAX_BODY_BYTES = 64_000[\s\S]*?total > MAX_BODY_BYTES/);
guard("Passkey relying party requires HTTPS configured origin", /SMARTCOMMERCE_APP_URL[\s\S]*?parsed\.protocol !== "https:"[\s\S]*?PASSKEY_ORIGIN_NOT_CONFIGURED/);
guard("Passkey session requires live unrevoked server session", /customer_sessions s[\s\S]*?s\.token_hash = \$\{hashToken\(token\)\}[\s\S]*?s\.revoked_at IS NULL[\s\S]*?s\.expires_at > NOW\(\)/);
guard("Passkey actions are IP rate limited", /enforceDurableRateLimit\(\{ request, action: `passkey_\$\{action \|\| "unknown"\}_ip`[\s\S]*?limit: 20[\s\S]*?windowSeconds: 900/);
guard("Passkey actions are account rate limited", /enforceDurableRateLimit\(\{ request, action: `passkey_\$\{action \|\| "unknown"\}_account`[\s\S]*?subject: session\.customer_id[\s\S]*?limit: 20/);
guard("Passkey registration requires recent step up", /action === "registration_options"[\s\S]*?sessionRequiresStepUp\(\{ tokenHash, maxAuthenticationAgeSeconds: 600 \}\)/);
guard("Passkey registration requires user verification", /generateRegistrationOptions\([\s\S]*?userVerification: "required"/);
guard("Passkey registration verification binds challenge origin and RP ID", /verifyRegistrationResponse\([\s\S]*?expectedChallenge[\s\S]*?expectedOrigin: origin[\s\S]*?expectedRPID: rpID[\s\S]*?requireUserVerification: true/);
guard("Passkey authentication requires user verification", /generateAuthenticationOptions\([\s\S]*?userVerification: "required"/);
guard("Passkey authentication verifies exact registered credential", /passkeys\.find\(\(candidate\) => candidate\.credential_id === credentialResponse\.id\)/);
guard("Passkey authentication binds challenge origin and RP ID", /verifyAuthenticationResponse\([\s\S]*?expectedChallenge[\s\S]*?expectedOrigin: origin[\s\S]*?expectedRPID: rpID[\s\S]*?requireUserVerification: true/);
guard("Passkey challenges are short lived", /const CHALLENGE_TTL_MS = 5 \* 60 \* 1000/);
guard("Passkey challenges are session and customer scoped", /auth_step_up_challenges[\s\S]*?customer_id = \$\{input\.customerId\}[\s\S]*?session_id = \$\{input\.sessionId\}[\s\S]*?status = 'pending'[\s\S]*?expires_at > NOW\(\)/);
guard("Passkey challenge consumption is concurrency safe", /FOR UPDATE SKIP LOCKED/);
guard("Passkey sign counter is advanced after verification", /SET sign_count = \$\{verification\.authenticationInfo\.newCounter\}/);
guard("Successful passkey authentication grants bounded step up", /const PASSKEY_STEP_UP_MS = 10 \* 60 \* 1000[\s\S]*?auth_level = 'passkey'[\s\S]*?step_up_expires_at = \$\{stepUpExpiresAt\}/);
reject("Passkey verification never trusts caller supplied origin", /expectedOrigin:\s*(credentialResponse|input|request)/);
reject("Passkey verification never trusts caller supplied RP ID", /expectedRPID:\s*(credentialResponse|input|request)/);

console.log(`Passkey security regression gate passed: ${checks.length} invariants verified.`);
