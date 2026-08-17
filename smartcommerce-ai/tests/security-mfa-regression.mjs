import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const mfa = await readFile(new URL("../api/account-mfa.ts", import.meta.url), "utf8");

const checks = [];
function guard(name, pattern, message) {
  checks.push(name);
  assert.match(mfa, pattern, message || `${name} invariant is missing`);
}
function reject(name, pattern, message) {
  checks.push(name);
  assert.doesNotMatch(mfa, pattern, message || `${name} forbidden pattern returned`);
}

guard("MFA session requires live unrevoked server session", /customer_sessions[\s\S]*?token_hash=\$\{tokenHash\}[\s\S]*?revoked_at IS NULL[\s\S]*?expires_at>NOW\(\)/);
guard("MFA mutations enforce same origin", /if\(!sameOrigin\(req\)\)return send\(res,403/);
guard("MFA request bodies are bounded", /const MAX_BODY_BYTES = 12_000[\s\S]*?if\(n>MAX_BODY_BYTES\)/);
guard("TOTP secrets use AES-256-GCM", /createCipheriv\("aes-256-gcm"[\s\S]*?getAuthTag\(\)/);
guard("MFA encryption key is required from environment", /SMARTCOMMERCE_MFA_ENCRYPTION_KEY[\s\S]*?length<32/);
guard("TOTP validation uses timing safe comparison", /validTotp[\s\S]*?timingSafeEqual\(expected,actual\)/);
guard("TOTP enrollment requires recent step up", /action==="totp_begin"[\s\S]*?sessionRequiresStepUp\(\{tokenHash,maxAuthenticationAgeSeconds:600\}\)/);
guard("TOTP disable requires strong step up", /action==="disable_totp"[\s\S]*?STRONG_STEP_UP_REQUIRED[\s\S]*?\['mfa','passkey'\]\.includes\(session\.auth_level\)/);
guard("Recovery codes are stored hashed", /function recoveryHash\(code:string\)\{return `sha256:\$\{createHash\("sha256"\)/);
guard("Recovery codes are one time use", /action==="recovery_verify"[\s\S]*?UPDATE customer_authenticators SET revoked_at=NOW\(\),status='revoked',last_used_at=NOW\(\)/);
guard("Successful MFA grants bounded step up", /const STEP_UP_TTL_MS = 10 \* 60 \* 1000[\s\S]*?step_up_expires_at/);
guard("Disabling MFA downgrades all active sessions", /UPDATE customer_sessions SET auth_level='password',step_up_expires_at=NULL WHERE customer_id=\$\{session\.customer_id\} AND revoked_at IS NULL/);
reject("MFA secret is never stored plaintext", /secret_encrypted\s*[,)]\s*VALUES[\s\S]*?\$\{secret\}/);

console.log(`MFA security regression gate passed: ${checks.length} invariants verified.`);
