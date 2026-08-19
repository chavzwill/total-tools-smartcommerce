import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const account = await readFile(new URL("../api/account.ts", import.meta.url), "utf8");

function guard(name, pattern) {
  assert.match(account, pattern, `${name} invariant is missing`);
}

function reject(name, pattern) {
  assert.doesNotMatch(account, pattern, `${name} forbidden pattern returned`);
}

// Session cookies must stay scoped, inaccessible to client JavaScript, and protected against cross-site mutation.
guard("session cookie is HttpOnly", /function\s+sessionCookie[\s\S]*?HttpOnly/);
guard("session cookie is SameSite Lax", /function\s+sessionCookie[\s\S]*?SameSite=Lax/);
guard("session cookie is Secure in production", /process\.env\.NODE_ENV\s*===\s*"production"\s*\?\s*"; Secure"/);
guard("session cookie is path scoped to application root", /COOKIE_NAME[\s\S]*?Path=\//);
guard("logout clears the session cookie", /function\s+clearSessionCookie[\s\S]*?Max-Age=0/);

// Session tokens must never be persisted in plaintext and must be rotated at authentication boundaries.
guard("session tokens are cryptographically random", /randomBytes\(32\)\.toString\("base64url"\)/);
guard("session tokens are hashed before persistence", /const\s+tokenHash\s*=\s*hashToken\(token\)[\s\S]*?INSERT\s+INTO\s+customer_sessions/);
guard("session lookup requires active unrevoked expiry", /WHERE\s+s\.token_hash\s*=\s*\$\{hashToken\(token\)\}[\s\S]*?s\.revoked_at\s+IS\s+NULL[\s\S]*?s\.expires_at\s*>\s*NOW\(\)/);
guard("login revokes any prior presented session before issuing a new one", /if\s*\(action\s*===\s*"login"\)[\s\S]*?await\s+revokeSession\(token\);[\s\S]*?await\s+createSession\(customer,\s*request\)/);
guard("logout revokes the active server session", /if\s*\(action\s*===\s*"logout"\)[\s\S]*?await\s+revokeSession\(token\)/);

// Authentication endpoints must retain anti-abuse and request-integrity controls.
guard("mutating account requests enforce same-origin", /if\s*\(!sameOrigin\(request\)\)[\s\S]*?ORIGIN_REJECTED/);
guard("login is durably rate limited by IP", /action:\s*"login_ip"[\s\S]*?limit:\s*40/);
guard("login is durably rate limited by identity", /action:\s*"login_identity"[\s\S]*?limit:\s*10/);
guard("signup is durably rate limited by IP", /action:\s*"signup_ip"[\s\S]*?limit:\s*20/);
guard("signup is durably rate limited by identity", /action:\s*"signup_identity"[\s\S]*?limit:\s*5/);
guard("account request bodies are bounded", /MAX_BODY_BYTES\s*=\s*16_000[\s\S]*?BODY_TOO_LARGE/);
guard("password verification uses timing-safe comparison", /timingSafeEqual\(actual,\s*expected\)/);
reject("session token is never returned in JSON payload", /authenticated:\s*true[\s\S]{0,120}?token\s*:/);

console.log("Session security regression gate passed.");
