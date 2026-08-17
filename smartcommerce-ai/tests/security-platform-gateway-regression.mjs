import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(here, "../api/platform/[...path].ts");
const source = await readFile(sourcePath, "utf8");

const checks = [
  ["protected operations fail closed when gateway token is missing", /PLATFORM_GATEWAY_NOT_CONFIGURED/],
  ["protected operations require trusted bearer authorization", /PLATFORM_AUTH_REQUIRED/],
  ["internal token comes from environment", /SMARTCOMMERCE_PLATFORM_INTERNAL_TOKEN/],
  ["bearer comparison is timing safe", /timingSafeEqual/],
  ["authorization header is not forwarded downstream", /normalized === "authorization"/],
  ["host headers are not trusted from callers", /normalized === "host"[\s\S]*normalized === "x-forwarded-host"/],
  ["public callers cannot inject actor identity", /normalized === "x-actor-id"/],
  ["public callers cannot inject connection identity", /normalized === "x-connection-id"/],
  ["public callers cannot inject business account identity", /normalized === "x-business-account-id"/],
  ["public callers cannot inject provider identity", /normalized === "x-provider-id"/],
  ["server controls trusted business account identity", /SMARTCOMMERCE_BUSINESS_ACCOUNT_ID/],
  ["server controls trusted provider identity", /SMARTCOMMERCE_PROVIDER_ID/],
  ["request bodies are bounded", /MAX_BODY_BYTES\s*=\s*64\s*\*\s*1024/],
  ["oversized platform requests return 413", /PLATFORM_REQUEST_TOO_LARGE/],
  ["platform responses are no-store", /Cache-Control",\s*"no-store/],
  ["platform responses prevent MIME sniffing", /X-Content-Type-Options",\s*"nosniff/],
  ["only explicitly enumerated GET catalog paths are public", /if \(method !== "GET"\) return false/],
  ["assistant is the only explicit public POST surface", /method === "POST" && path === "\/api\/platform\/assistant"/],
  ["orders use idempotency protection", /platform\.order\.create/],
  ["invoices use idempotency protection", /platform\.invoice\.create/],
  ["checkout uses idempotency protection", /platform\.checkout\.create/],
  ["webhooks use provider event idempotency", /x-provider-event-id/],
  ["protected writes execute through idempotency wrapper", /executeIdempotentPlatformWrite/],
  ["webhook idempotency lasts longer than ordinary writes", /path === "\/api\/platform\/integrations\/webhooks" \? 72 : 24/],
];

const failures = checks.filter(([, pattern]) => !pattern.test(source)).map(([name]) => name);

if (failures.length) {
  console.error("Platform gateway security regression gate failed:");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(`Platform gateway security regression gate passed (${checks.length} invariants).`);
