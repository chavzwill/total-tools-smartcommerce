import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../api/guest-checkout.ts", import.meta.url), "utf8");
const identity = await readFile(new URL("../src/server/guestCheckoutIdentity.ts", import.meta.url), "utf8");
const combined = `${source}\n${identity}`;

const checks = [];
function guard(name, pattern, message) {
  checks.push(name);
  assert.match(combined, pattern, message || `${name} invariant is missing`);
}
function reject(name, pattern, message) {
  checks.push(name);
  assert.doesNotMatch(source, pattern, message || `${name} forbidden pattern returned`);
}

guard("guest checkout is POST only", /toUpperCase\(\)\s*!==\s*"POST"[\s\S]*?setHeader\("Allow",\s*"POST"\)/);
guard("guest checkout enforces same-origin", /if\s*\(!sameOrigin\(request\)\)\s*return\s+send\(response,\s*403/);
guard("guest checkout has a bounded request body", /const\s+MAX_BODY_BYTES\s*=\s*24_000[\s\S]*?total\s*>\s*MAX_BODY_BYTES[\s\S]*?status:\s*413/);
guard("guest checkout rate limits by request IP", /enforceDurableRateLimit\([\s\S]*?action:\s*"commerce_guest_quote_ip"[\s\S]*?subject:\s*requestIp\(request\)[\s\S]*?windowSeconds:\s*600/);
guard("guest cart item count is bounded", /const\s+MAX_ITEMS\s*=\s*80[\s\S]*?rawItems\.length\s*>\s*MAX_ITEMS/);
guard("guest cart quantity is bounded", /Number\.isInteger\(quantity\)[\s\S]*?quantity\s*<\s*1[\s\S]*?quantity\s*>\s*999/);
guard("product IDs are length bounded", /productId\.length\s*>\s*180/);
guard("provider identity comes from server configuration", /SMARTCOMMERCE_BUSINESS_ACCOUNT_ID[\s\S]*?SMARTCOMMERCE_PROVIDER_ID/);
guard("product lookup uses fixed internal origin", /https:\/\/smartcommerce\.internal\/api\/platform\/products\//);
guard("product lookup dispatches in-process", /handlePlatformRestRequest\(platformRequest,\s*platformService\)/);
guard("provider product status is revalidated", /product\.active\s*===\s*false[\s\S]*?product\.purchasable\s*===\s*false/);
guard("provider price is recalculated server-side", /retailPrice\(product\)[\s\S]*?unitPrice:\s*price\.amount/);
guard("mixed currency carts are rejected", /currency\s*&&\s*currency\s*!==\s*price\.currency[\s\S]*?MIXED_CURRENCY_CART/);
guard("guest quotes are short lived", /const\s+QUOTE_TTL_MS\s*=\s*10\s*\*\s*60\s*\*\s*1000/);
guard("guest identity uses an opaque server token", /randomBytes\(32\)[\s\S]*base64url/);
guard("guest token is stored hashed", /token_hash[\s\S]*hashGuestToken\(token\)/);
guard("guest cookie is HttpOnly and SameSite Lax", /HttpOnly; SameSite=Lax/);
guard("guest cookie is secure by default", /guestCheckoutCookie\(token:\s*string,\s*secure\s*=\s*true\)/);
guard("guest sessions are durable and expiring", /CREATE TABLE IF NOT EXISTS guest_checkout_sessions[\s\S]*expires_at[\s\S]*revoked_at/);
guard("guest quotes are durable and session owned", /CREATE TABLE IF NOT EXISTS guest_checkout_quotes[\s\S]*guest_session_id[\s\S]*REFERENCES guest_checkout_sessions/);
guard("guest quote fingerprint is session bound", /guestSessionId:\s*guestSession\.id[\s\S]*quoteBucket/);
guard("guest quote is persisted before response", /persistGuestQuote\([\s\S]*guestSessionId:\s*guestSession\.id[\s\S]*return send\(response,\s*201/);
guard("payment is not falsely marked available", /paymentAvailable:\s*false/);
guard("guest quote mode is explicit", /checkoutMode:\s*"guest"\s+as\s+const/);
reject("browser-submitted prices are never trusted", /item\?\.(price|unitPrice|subtotal|total)|input\.(price|unitPrice|subtotal|total)/);
reject("caller host is not used for provider routing", /x-forwarded-proto|requestOrigin|new URL\([^,]+,\s*request/);

console.log(`Guest checkout security regression gate passed: ${checks.length} invariants verified.`);
