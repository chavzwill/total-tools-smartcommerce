import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const target = path.join(root, "api", "security-monitor.ts");
const source = fs.readFileSync(target, "utf8");

const checks = [
  ["cron secret authorization", /CRON_SECRET/],
  ["timing-safe credential comparison", /timingSafeEqual/],
  ["GET-only endpoint", /METHOD_NOT_ALLOWED/],
  ["durable monitor probe rate limit", /enforceDurableRateLimit\([\s\S]*security_monitor_probe_ip/],
  ["IP-scoped monitor rate limit", /subject:\s*requestIp\(request\)/],
  ["bounded monitor probe window", /windowSeconds:\s*300/],
  ["429 retry-after header", /Retry-After/],
  ["rate-limit audit event", /security_monitor_probe_blocked/],
  ["unauthorized monitor audit event", /security_monitor_auth_rejected/],
  ["fail closed when cron secret missing", /SECURITY_MONITOR_NOT_CONFIGURED/],
  ["fail closed when cron authorization rejected", /SECURITY_MONITOR_AUTH_REQUIRED/],
  ["security operations monitor execution", /runSecurityOperationsMonitor\(\)/],
  ["monitor finding conflict status", /result\.ok\s*\?\s*200\s*:\s*409/],
  ["no-store responses", /Cache-Control",\s*"no-store"/],
  ["no-referrer responses", /Referrer-Policy",\s*"no-referrer"/],
];

const failures = checks.filter(([, pattern]) => !pattern.test(source));
if (failures.length) {
  console.error("Security monitor endpoint regression failures:");
  for (const [label] of failures) console.error(`- ${label}`);
  process.exit(1);
}

console.log(`Security monitor endpoint regression gate passed (${checks.length} invariants).`);
