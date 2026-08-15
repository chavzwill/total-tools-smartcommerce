import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const load = async (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

const commerce = await load("api/commerce.ts");
const commercial = await load("api/commercial-account.ts");
const financial = await load("api/commercial-financial-policy.ts");

const checks = [];
function guard(name, source, pattern, message) {
  checks.push(name);
  assert.match(source, pattern, message || `${name} authorization invariant is missing`);
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

console.log(`Authorization regression gate passed: ${checks.length} invariants verified.`);
