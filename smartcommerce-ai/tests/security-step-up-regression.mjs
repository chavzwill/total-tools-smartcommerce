import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const target = path.join(root, "api", "account-step-up.ts");
const source = fs.readFileSync(target, "utf8");

const checks = [
  ["POST-only endpoint", /METHOD_NOT_ALLOWED[\s\S]*POST is required/],
  ["same-origin enforcement", /sameOrigin\(request\)/],
  ["origin rejection audit", /step_up_origin_rejected/],
  ["bounded request body", /MAX_BODY_BYTES\s*=\s*8_000/],
  ["live unrevoked session lookup", /revoked_at IS NULL[\s\S]*expires_at > NOW\(\)/],
  ["password hash joined server-side", /JOIN customer_accounts c ON c\.id = s\.customer_id/],
  ["scrypt password verification", /scrypt\(password, salt, expected\.length\)/],
  ["timing-safe password comparison", /timingSafeEqual\(actual, expected\)/],
  ["IP rate limiting", /action:\s*"step_up_ip"[\s\S]*subject:\s*requestIp\(request\)[\s\S]*limit:\s*30/],
  ["session rate limiting", /action:\s*"step_up_session"[\s\S]*subject:\s*identity\.session_id[\s\S]*limit:\s*8/],
  ["failed attempt audit", /eventType:\s*"step_up_failed"[\s\S]*riskLevel:\s*"high"/],
  ["10 minute step-up TTL", /STEP_UP_TTL_MS\s*=\s*10\s*\*\s*60\s*\*\s*1000/],
  ["step-up persisted only to live session", /UPDATE customer_sessions[\s\S]*step_up_expires_at[\s\S]*WHERE id = \$\{identity\.session_id\}[\s\S]*revoked_at IS NULL/],
  ["successful step-up audit", /eventType:\s*"step_up_succeeded"/],
  ["rate-limit retry-after", /Retry-After/],
  ["rate-limit audit", /step_up_rate_limited/],
  ["oversized request rejection", /REQUEST_TOO_LARGE/],
  ["no-store responses", /Cache-Control",\s*"no-store"/],
  ["no raw password logging", /console\.error\("account_step_up_error",\s*\{\s*code:/],
];

const failures = checks.filter(([, pattern]) => !pattern.test(source));
if (failures.length) {
  console.error("Password step-up security regression failures:");
  for (const [label] of failures) console.error(`- ${label}`);
  process.exit(1);
}

console.log(`Password step-up security regression gate passed (${checks.length} invariants).`);
