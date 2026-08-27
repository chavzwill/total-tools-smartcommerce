import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = fs.readFileSync(path.join(root, "api", "commercial-account.ts"), "utf8");
const reviews = fs.readFileSync(path.join(root, "api", "commercial-account-reviews.ts"), "utf8");

const checks = [
  ["live unrevoked customer session", source, /customer_sessions[\s\S]*revoked_at IS NULL[\s\S]*expires_at > NOW\(\)/],
  ["same-origin mutation protection", source, /method !== "POST"[\s\S]*sameOrigin\(request\)/],
  ["bounded request body", source, /MAX_BODY_BYTES\s*=\s*24_000[\s\S]*BODY_TOO_LARGE/],
  ["customer application daily limit", source, /APPLICATION_CUSTOMER_DAILY_LIMIT\s*=\s*3/],
  ["IP application daily limit", source, /APPLICATION_IP_DAILY_LIMIT\s*=\s*10/],
  ["durable customer application throttling", source, /commercial_application_customer[\s\S]*windowSeconds:\s*86_400/],
  ["durable IP application throttling", source, /commercial_application_ip[\s\S]*requestIp\(request\)[\s\S]*windowSeconds:\s*86_400/],
  ["duplicate verified organisation blocking", source, /commercial_duplicate_verified_organisation_claim[\s\S]*COMMERCIAL_ORGANISATION_EXISTS/],
  ["government claims require manual review", source, /government_manual_review_required/],
  ["repeated applications are risk flagged", source, /repeated_commercial_applications/],
  ["new privileges start locked", source, /privilege_status[\s\S]*'locked'/],
  ["new owner authority starts pending", source, /'owner',\s*'active',\s*'pending'/],
  ["verified member authority required for privilege", source, /member\.authority_status === 'verified'/],
  ["verified organisation required for privilege", source, /verification_status === 'verified'/],
  ["enabled commercial privileges required", source, /privilege_status === 'enabled'/],
  ["verified provider mapping required", source, /mapping_status = 'verified'/],
  ["admin-only tax identifier visibility", source, /m\.role IN \('owner','admin'\) THEN a\.tax_identifier ELSE NULL/],
  ["admin-only provider customer identifier visibility", source, /m\.role IN \('owner','admin'\) THEN pm\.provider_customer_id ELSE NULL/],
  ["member email restricted to admins", source, /memberEmails:\s*isAdmin/],
  ["verification applications restricted to admins", source, /verificationApplications:\s*isAdmin/],
  ["approval rules role-gated", source, /APPROVAL_RULE_ROLES/],
  ["commercial audit trail", source, /INSERT INTO commercial_audit_events/],
  ["security event infrastructure", source, /recordSecurityEvent/],
  ["no-store responses", source, /Cache-Control",\s*"no-store"/],
  ["oversized-body rejection", source, /status\)?\s*===\s*413|status\)===413|REQUEST_TOO_LARGE/],

  ["staff review uses staff session", reviews, /readStaffSession[\s\S]*STAFF_COOKIE_NAME/],
  ["staff review is permission gated", reviews, /purchasing_approve[\s\S]*security_manage/],
  ["staff review same-origin protected", reviews, /sameOrigin\(req\)/],
  ["organisation approval verifies applicant authority", reviews, /UPDATE commercial_account_members m SET authority_status='verified'/],
  ["organisation approval verifies organisation", reviews, /verification_status='verified'/],
  ["organisation approval does not directly enable privileges", reviews, /account_update AS\([\s\S]*verification_status='verified'[\s\S]*UPDATE commercial_account_members/],
  ["provider mapping requires verified organisation", reviews, /ORGANISATION_NOT_VERIFIED/],
  ["provider mapping records verified state", reviews, /mapping_status='verified'/],
  ["privileges enable only during provider verification", reviews, /UPDATE commercial_accounts SET privilege_status='enabled'[\s\S]*verification_status='verified'/],
  ["financial controls require completed activation", reviews, /COMMERCIAL_ACTIVATION_INCOMPLETE/],
  ["financial credit requires explicit staff decision", reviews, /creditEnabled=Boolean\(input\.creditEnabled\)/],
  ["financial control persists approved state", reviews, /control_status='approved'/],
  ["financial decision references persisted control", reviews, /const controlId=controls\[0\]\?\.id[\s\S]*commercial_financial_decision_events/],
  ["review actions are audited", reviews, /commercial_application_reviewed/],
  ["provider verification is audited", reviews, /commercial_provider_mapping_verified/],
  ["financial approval is audited", reviews, /commercial_financial_controls_approved/],
  ["review API returns safe generic operational error", reviews, /COMMERCIAL_REVIEWS_UNAVAILABLE/],
];

const failures = checks.filter(([, text, pattern]) => !pattern.test(text));
if (failures.length) {
  console.error("Commercial account security regression failures:");
  for (const [label] of failures) console.error(`- ${label}`);
  process.exit(1);
}

console.log(`Commercial account security regression gate passed (${checks.length} invariants).`);
