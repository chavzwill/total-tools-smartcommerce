import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(here, "../api/platform/[...path].ts");
const vitePath = path.resolve(here, "../vite.config.ts");
const shadowVitePath = path.resolve(here, "../vite.config.js");
const source = await readFile(sourcePath, "utf8");
const vite = await readFile(vitePath, "utf8");

const checks = [
  ["protected operations fail closed when gateway token is missing", /PLATFORM_GATEWAY_NOT_CONFIGURED/, source],
  ["protected operations require trusted bearer authorization", /PLATFORM_AUTH_REQUIRED/, source],
  ["internal token comes from environment", /SMARTCOMMERCE_PLATFORM_INTERNAL_TOKEN/, source],
  ["bearer comparison is timing safe", /timingSafeEqual/, source],
  ["authorization header is not forwarded downstream", /normalized === "authorization"/, source],
  ["host headers are not trusted from callers", /normalized === "host"[\s\S]*normalized === "x-forwarded-host"/, source],
  ["public callers cannot inject actor identity", /normalized === "x-actor-id"/, source],
  ["public callers cannot inject connection identity", /normalized === "x-connection-id"/, source],
  ["public callers cannot inject business account identity", /normalized === "x-business-account-id"/, source],
  ["public callers cannot inject provider identity", /normalized === "x-provider-id"/, source],
  ["server controls trusted business account identity", /SMARTCOMMERCE_BUSINESS_ACCOUNT_ID/, source],
  ["server controls trusted provider identity", /SMARTCOMMERCE_PROVIDER_ID/, source],
  ["request bodies are bounded", /MAX_BODY_BYTES\s*=\s*64\s*\*\s*1024/, source],
  ["oversized platform requests return 413", /PLATFORM_REQUEST_TOO_LARGE/, source],
  ["platform responses are no-store", /Cache-Control",\s*"no-store/, source],
  ["platform responses prevent MIME sniffing", /X-Content-Type-Options",\s*"nosniff/, source],
  ["only explicitly enumerated GET catalog paths are public", /if \(method !== "GET"\) return false/, source],
  ["assistant is the only explicit public POST surface", /method === "POST" && path === "\/api\/platform\/assistant"/, source],
  ["orders use idempotency protection", /platform\.order\.create/, source],
  ["invoices use idempotency protection", /platform\.invoice\.create/, source],
  ["checkout uses idempotency protection", /platform\.checkout\.create/, source],
  ["webhooks use provider event idempotency", /x-provider-event-id/, source],
  ["protected writes execute through idempotency wrapper", /executeIdempotentPlatformWrite/, source],
  ["webhook idempotency lasts longer than ordinary writes", /path === "\/api\/platform\/integrations\/webhooks" \? 72 : 24/, source],
  ["dev router business identity comes only from server config", /businessAccountId:\s*process\.env\.SMARTCOMMERCE_BUSINESS_ACCOUNT_ID\s*\|\|\s*""/, vite],
  ["dev router provider identity comes only from server config", /providerId:[\s\S]*?process\.env\.SMARTCOMMERCE_PROVIDER_ID/, vite],
];

const forbidden = [
  ["dev router must not trust business identity headers", /request\.headers\.get\("x-business-account-id"\)/, vite],
  ["dev router must not trust provider identity headers", /request\.headers\.get\("x-provider-id"\)/, vite],
  ["dev router must not trust actor identity headers", /request\.headers\.get\("x-actor-id"\)/, vite],
  ["dev router must not trust connection identity headers", /request\.headers\.get\("x-connection-id"\)/, vite],
];

const failures = checks.filter(([, pattern, target]) => !pattern.test(target)).map(([name]) => name);
for (const [name, pattern, target] of forbidden) {
  if (pattern.test(target)) failures.push(name);
}
if (existsSync(shadowVitePath)) {
  failures.push("stale vite.config.js must not shadow the hardened TypeScript config");
}

if (failures.length) {
  console.error("Platform gateway security regression gate failed:");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(`Platform gateway security regression gate passed (${checks.length + forbidden.length + 1} invariants).`);
