import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const target = path.join(root, "api", "commercial-account.ts");
const source = fs.readFileSync(target, "utf8");

const checks = [
  ["live unrevoked customer session", /customer_sessions[\s\S]*revoked_at IS NULL[\s\S]*expires_at > NOW\(\)/],
  ["same-origin mutation protection", /method !== "POST"[\s\S]*sameOrigin\(request\)/],
  ["bounded request body", /MAX_BODY_BYTES\s*=\s*24_000[\s\S]*BODY_TOO_LARGE/],
  ["customer application daily limit", /APPLICATION_CUSTOMER_DAILY_LIMIT\s*=\s*3/],
  ["IP application daily limit", /APPLICATION_IP_DAILY_LIMIT\s*=\s*10/],
  ["durable customer application throttling", /commercial_application_customer[\s\S]*windowSeconds:\s*86_400/],
  ["durable IP application throttling", /commercial_application_ip[\s\S]*requestIp\(request\)[\s\S]*windowSeconds:\s*86_400/],
  ["duplicate verified organisation blocking", /commercial_duplicate_verified_organisation_claim[\s\S]*COMMERCIAL_ORGANISATION_EXISTS/],
  ["government claims require manual review", /government_manual_review_required/],
  ["repeated applications are risk flagged", /repeated_commercial_applications/],
  ["new privileges start locked", /privilege_status[\s\S]*'locked'/],
  ["new owner authority starts pending", /'owner',\s*'active',\s*'pending'/],
  ["verified member authority required for privilege", /member\.authority_status === 'verified'/],
  ["verified organisation required for privilege", /verification_status === 'verified'/],
  ["enabled commercial privileges required", /privilege_status === 'enabled'/],
  ["verified provider mapping required", /mapping_status = 'verified'/],
  ["admin-only tax identifier visibility", /m\.role IN \('owner','admin'\) THEN a\.tax_identifier ELSE NULL/],
  ["admin-only provider customer identifier visibility", /m\.role IN \('owner','admin'\) THEN pm\.provider_customer_id ELSE NULL/],
  ["member email restricted to admins", /memberEmails:\s*isAdmin/],
  ["verification applications restricted to admins", /verificationApplications:\s*isAdmin/],
  ["approval rules role-gated", /APPROVAL_RULE_ROLES/],
  ["commercial audit trail", /INSERT INTO commercial_audit_events/],
  ["security event infrastructure", /recordSecurityEvent/],
  ["no-store responses", /Cache-Control",\s*"no-store"/],
  ["oversized-body rejection", /status\)?\s*===\s*413|status\)===413|REQUEST_TOO_LARGE/],
];

const failures = checks.filter(([, pattern]) => !pattern.test(source));
if (failures.length) {
  console.error("Commercial account security regression failures:");
  for (const [label] of failures) console.error(`- ${label}`);
  process.exit(1);
}

console.log(`Commercial account security regression gate passed (${checks.length} invariants).`);
