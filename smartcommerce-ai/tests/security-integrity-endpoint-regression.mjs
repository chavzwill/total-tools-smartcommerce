import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const target = path.join(root, "api", "security-integrity.ts");
const source = fs.readFileSync(target, "utf8");

const checks = [
  ["server-only internal token", /SMARTCOMMERCE_PLATFORM_INTERNAL_TOKEN/],
  ["timing-safe token comparison", /timingSafeEqual/],
  ["GET-only endpoint", /METHOD_NOT_ALLOWED/],
  ["durable integrity probe rate limit", /enforceDurableRateLimit\([\s\S]*security_integrity_probe_ip/],
  ["IP-scoped rate limit subject", /subject:\s*requestIp\(request\)/],
  ["bounded probe velocity window", /windowSeconds:\s*300/],
  ["429 retry-after header", /Retry-After/],
  ["rate-limit audit event", /security_integrity_probe_blocked/],
  ["unauthorized probe audit event", /security_integrity_auth_rejected/],
  ["critical integrity failure event", /eventType:\s*"security_audit_integrity_failed"[\s\S]*riskLevel:\s*"critical"/],
  ["fail closed when internal token missing", /SECURITY_INTEGRITY_ENDPOINT_NOT_CONFIGURED/],
  ["fail closed when authorization rejected", /SECURITY_INTEGRITY_AUTH_REQUIRED/],
  ["integrity verification call", /verifySecurityEventIntegrity\(\)/],
  ["integrity mismatch returns conflict", /send\(response,\s*409/],
  ["no-store responses", /Cache-Control",\s*"no-store"/],
  ["no-referrer responses", /Referrer-Policy",\s*"no-referrer"/],
];

const failures = checks.filter(([, pattern]) => !pattern.test(source));
if (failures.length) {
  console.error("Integrity endpoint security regression failures:");
  for (const [label] of failures) console.error(`- ${label}`);
  process.exit(1);
}

console.log(`Integrity endpoint security regression gate passed (${checks.length} invariants).`);
