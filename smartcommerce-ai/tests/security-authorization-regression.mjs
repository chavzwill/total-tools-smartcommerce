import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const load = async (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

const commerce = await load("api/commerce.ts");
const commercial = await load("api/commercial-account.ts");
const financial = await load("api/commercial-financial-policy.ts");
const platform = await load("api/platform/[...path].ts");
const vercel = await load("vercel.json");

const checks = [];
function guard(name, source, pattern, message) {
  checks.push(name);
  assert.match(source, pattern, message || `${name} authorization invariant is missing`);
}
function reject(name, source, pattern, message) {
  checks.push(name);
  assert.doesNotMatch(source, pattern, message || `${name} forbidden trust pattern returned`);
}

// Customer session identity must always come from a live, unrevoked server-side session.
guard(
  "commerce session lookup is server-scoped",
  commerce,
  /FROM\s+customer_sessions[\s\S]*?WHERE\s+token_hash\s*=\s*\$\{hashToken\(token\)\}[\s\S]*?revoked_at\s+IS\s+NULL[\s\S]*?expires_at\s*>\s*NOW\(\)/,
);
guard(
  "commercial session lookup is server-scoped",
  commercial,
  /FROM\s+customer_sessions[\s\S]*?WHERE\s+token_hash\s*=\s*\$\{hashToken\(token\)\}[\s\S]*?revoked_at\s+IS\s+NULL[\s\S]*?expires_at\s*>\s*NOW\(\)/,
);
guard(
  "financial session lookup is server-scoped",
  financial,
  /FROM\s+customer_sessions\s+WHERE\s+token_hash=\$\{tokenHash\}[\s\S]*?revoked_at\s+IS\s+NULL[\s\S]*?expires_at>NOW\(\)/,
);

// Cart access and mutations must be derived from the authenticated customer's active cart.
guard(
  "active cart is customer scoped",
  commerce,
  /FROM\s+customer_carts[\s\S]*?WHERE\s+customer_id\s*=\s*\$\{customerId\}\s+AND\s+status\s*=\s*'active'/,
);
guard(
  "cart quantity mutation is active-cart scoped",
  commerce,
  /UPDATE\s+customer_cart_items\s+SET\s+quantity\s*=\s*\$\{quantity\}[\s\S]*?WHERE\s+id\s*=\s*\$\{itemId\}\s+AND\s+cart_id\s*=\s*\$\{cart\.id\}/,
);
guard(
  "cart deletion is active-cart scoped",
  commerce,
  /DELETE\s+FROM\s+customer_cart_items\s+WHERE\s+id\s*=\s*\$\{itemId\}\s+AND\s+cart_id\s*=\s*\$\{cart\.id\}/,
);
guard(
  "quotes bind authenticated customer and active cart",
  commerce,
  /createQuote\(request,\s*customerId,\s*cart\.id\)/,
);

// Commerce-to-platform lookups must never route through caller-controlled Host/provider identity.
guard(
  "commerce product lookup uses fixed internal origin",
  commerce,
  /https:\/\/smartcommerce\.internal\/api\/platform\/products/,
);
guard(
  "commerce platform lookup dispatches in process",
  commerce,
  /handlePlatformRestRequest\(platformRequest,\s*platformService\)/,
);
guard(
  "commerce cart provider identity comes from server configuration",
  commerce,
  /const\s+trustedProviderId\s*=\s*process\.env\.SMARTCOMMERCE_PROVIDER_ID[\s\S]*?VALUES\s*\(\$\{id\},\s*\$\{cart\.id\},\s*\$\{itemType\},\s*\$\{trustedProviderId\}/,
);
reject(
  "commerce no longer constructs platform origin from request Host",
  commerce,
  /function\s+requestOrigin|x-forwarded-proto/,
);

// Commercial account resources must require an active membership for the exact customer/account pair.
guard(
  "commercial membership requires exact customer and account",
  commercial,
  /FROM\s+commercial_account_members[\s\S]*?WHERE\s+customer_id\s*=\s*\$\{customerId\}[\s\S]*?commercial_account_id\s*=\s*\$\{accountId\}[\s\S]*?status\s*=\s*'active'/,
);
guard(
  "commercial detail lookup checks membership first",
  commercial,
  /async\s+function\s+accountDetails\(customerId:\s*string,\s*accountId:\s*string\)[\s\S]*?const\s+member\s*=\s*await\s+membership\(customerId,\s*accountId\);[\s\S]*?if\s*\(!member\)\s*return\s+undefined/,
);
guard(
  "commercial account listing is customer scoped",
  commercial,
  /FROM\s+commercial_account_members\s+m[\s\S]*?WHERE\s+m\.customer_id\s*=\s*\$\{customerId\}[\s\S]*?m\.status\s*=\s*'active'/,
);

// Financial controls must resolve trust through the authenticated customer's exact membership.
guard(
  "financial trust requires exact customer and account",
  financial,
  /FROM\s+commercial_account_members\s+m\s+JOIN\s+commercial_accounts[\s\S]*?m\.customer_id=\$\{customerId\}\s+AND\s+m\.commercial_account_id=\$\{accountId\}\s+AND\s+m\.status='active'/,
);
guard(
  "financial GET uses session customer for trust lookup",
  financial,
  /const\s+trust=await\s+commercialTrust\(session\.customer_id,accountId\);if\(!trust\)return\s+send\(res,404/,
);
guard(
  "financial POST uses session customer for trust lookup",
  financial,
  /const\s+input=await\s+body\(req\)[\s\S]*?const\s+trust=await\s+commercialTrust\(session\.customer_id,accountId\)/,
);
guard(
  "financial override requester is authenticated customer",
  financial,
  /requester_customer_id[\s\S]*?VALUES\([\s\S]*?\$\{session\.customer_id\}/,
);

// Public platform reads must not accept tenant/provider identity from caller-controlled headers.
guard(
  "public platform identity headers are stripped",
  platform,
  /!privileged[\s\S]*?x-business-account-id[\s\S]*?x-provider-id/,
);
guard(
  "platform request URL ignores caller host headers",
  platform,
  /new URL\(rawPath,\s*"https:\/\/smartcommerce\.internal"\)/,
);
guard(
  "platform trusted identity can come from server configuration",
  platform,
  /SMARTCOMMERCE_BUSINESS_ACCOUNT_ID[\s\S]*?SMARTCOMMERCE_PROVIDER_ID/,
);

// Baseline browser responses must carry transport, isolation, framing, capability, and referrer controls.
guard("global anti-sniffing header", vercel, /"X-Content-Type-Options"[\s\S]*?"nosniff"/);
guard("global anti-framing header", vercel, /"X-Frame-Options"[\s\S]*?"DENY"/);
guard("global referrer policy", vercel, /"Referrer-Policy"[\s\S]*?"strict-origin-when-cross-origin"/);
guard("global HSTS header", vercel, /"Strict-Transport-Security"[\s\S]*?"max-age=31536000"/);
guard("global opener isolation header", vercel, /"Cross-Origin-Opener-Policy"[\s\S]*?"same-origin"/);
guard("global browser capability policy", vercel, /"Permissions-Policy"[\s\S]*?camera=\(self\)[\s\S]*?microphone=\(\)[\s\S]*?geolocation=\(\)[\s\S]*?payment=\(\)[\s\S]*?usb=\(\)/);

console.log(`Authorization regression gate passed: ${checks.length} invariants verified.`);
