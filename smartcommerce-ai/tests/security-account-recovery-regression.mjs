import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const api = await readFile(new URL("../api/account-security.ts", import.meta.url), "utf8");
const client = await readFile(new URL("../src/lib/customerAccount.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../src/pages/CustomerAccountPage.tsx", import.meta.url), "utf8");

const checks = [];
function guard(name, source, pattern, message) {
  checks.push(name);
  assert.match(source, pattern, message || `${name} invariant is missing`);
}
function reject(name, source, pattern, message) {
  checks.push(name);
  assert.doesNotMatch(source, pattern, message || `${name} forbidden pattern returned`);
}

guard("Recovery endpoint is POST only", api, /method[^\n]*POST[\s\S]*?METHOD_NOT_ALLOWED/);
guard("Recovery mutations enforce same origin", api, /if \(!sameOrigin\(request\)\)[\s\S]*?ORIGIN_REJECTED/);
guard("Recovery request bodies are bounded", api, /const MAX_BODY_BYTES = 16_000[\s\S]*?total > MAX_BODY_BYTES/);
guard("Reset tokens are cryptographically random", api, /randomBytes\(32\)\.toString\("base64url"\)/);
guard("Reset tokens are stored hashed", api, /token_hash[\s\S]*?hashToken\(raw\)/);
guard("Previous reset tokens are invalidated", api, /UPDATE customer_security_tokens[\s\S]*?SET consumed_at = NOW\(\)[\s\S]*?purpose = \$\{purpose\}[\s\S]*?consumed_at IS NULL/);
guard("Password reset lifetime is thirty minutes", api, /const RESET_TTL_MS = 1000 \* 60 \* 30/);
guard("Reset delivery requires HTTPS canonical app URL", api, /SMARTCOMMERCE_APP_URL[\s\S]*?parsed\.protocol !== "https:"/);
guard("Reset delivery requires configured email credentials", api, /RESEND_API_KEY[\s\S]*?SMARTCOMMERCE_EMAIL_FROM[\s\S]*?EMAIL_DELIVERY_NOT_CONFIGURED/);
guard("Reset email uses idempotency protection", api, /Idempotency-Key[\s\S]*?idempotencyKey/);
guard("Reset requests are enumeration safe", api, /If that account exists, a reset link will be sent\./);
guard("Reset requests are IP rate limited", api, /request_password_reset[\s\S]*?ipRateLimit\(request, action, 20\)/);
guard("Reset identities are independently rate limited", api, /password_reset_identity[\s\S]*?limit: 5/);
guard("Reset token attempts are rate limited", api, /password_reset_token[\s\S]*?limit: 8/);
guard("New passwords reuse account password policy", api, /function passwordAllowed[\s\S]*?length >= 10[\s\S]*?length <= 128/);
guard("Reset token consumption is single use and expiry checked", api, /purpose = 'password_reset'[\s\S]*?consumed_at IS NULL[\s\S]*?expires_at > NOW\(\)/);
guard("Successful reset replaces password hash", api, /UPDATE customer_accounts[\s\S]*?SET password_hash = \$\{storedPassword\}/);
guard("Successful reset revokes all active sessions", api, /UPDATE customer_sessions[\s\S]*?SET revoked_at = NOW\(\)[\s\S]*?customer_id IN \(SELECT id FROM updated\)[\s\S]*?revoked_at IS NULL/);
guard("Successful reset is security audited", api, /password_reset_succeeded[\s\S]*?success_sessions_revoked/);
guard("Client exposes password reset request", client, /export function requestPasswordReset\(email: string\)/);
guard("Client exposes password reset completion", client, /export function resetCustomerPassword\(token: string, password: string\)/);
guard("Account page supports forgot-password mode", page, /type Mode = "login" \| "signup" \| "forgot" \| "reset"/);
guard("Account page consumes reset tokens from route", page, /query\.get\("reset"\)/);
guard("Account page submits forgot-password requests", page, /handleForgotPassword[\s\S]*?requestPasswordReset/);
guard("Account page submits new password with reset token", page, /handleResetPassword[\s\S]*?resetCustomerPassword\(resetToken, password\)/);
reject("Raw reset tokens are not returned from API responses", api, /send\([^\n]*\{[^\n]*(?:raw|token\.raw)/);
reject("Reset token subject is not logged raw in success audit", api, /password_reset_succeeded[^\n]*subject:\s*rawToken/);

console.log(`Account recovery security regression gate passed: ${checks.length} invariants verified.`);
