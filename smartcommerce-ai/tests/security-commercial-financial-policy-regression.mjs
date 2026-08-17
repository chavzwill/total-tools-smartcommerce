import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const target = path.join(root, "api", "commercial-financial-policy.ts");
const source = fs.readFileSync(target, "utf8");

const checks = [
  ["live unrevoked session lookup", /customer_sessions[\s\S]*revoked_at IS NULL[\s\S]*expires_at>NOW\(\)/],
  ["session token is hashed before lookup", /tokenHash=hashToken\(token\)/],
  ["GET and POST only", /METHOD_NOT_ALLOWED[\s\S]*GET or POST is required/],
  ["same-origin POST enforcement", /if\(!sameOrigin\(req\)\)return send\(res,403/],
  ["bounded request body", /MAX_BODY_BYTES\s*=\s*12_000/],
  ["commercial membership scoped to customer", /m\.customer_id=\$\{customerId\}[\s\S]*m\.commercial_account_id=\$\{accountId\}/],
  ["active membership required", /m\.status='active'/],
  ["verified provider mapping required", /mapping_status='verified'/],
  ["verified organisation and member authority required", /authority_status==='verified'[\s\S]*verification_status==='verified'[\s\S]*privilege_status==='enabled'/],
  ["financial view role allowlist", /FINANCIAL_VIEW_ROLES\s*=\s*new Set\(\["owner", "admin", "approver", "buyer"\]\)/],
  ["financial evaluation role allowlist", /FINANCIAL_EVALUATE_ROLES\s*=\s*new Set\(\["owner", "admin", "approver", "buyer"\]\)/],
  ["override role allowlist excludes buyer", /FINANCIAL_OVERRIDE_ROLES\s*=\s*new Set\(\["owner", "admin", "approver"\]\)/],
  ["strong step-up required for financial mutations", /if\(!session\.strongStepUp\)[\s\S]*STRONG_STEP_UP_REQUIRED/],
  ["sensitive action risk assessment", /assessSensitiveActionRisk\(/],
  ["fresh strong step-up on changed transaction context", /requiresFreshStrongStepUp[\s\S]*step_up_expires_at=NULL/],
  ["financial controls must be approved", /control_status!=="approved"/],
  ["credit requests checked against configured ceiling", /amount<=Number\(c\.credit_limit_minor\)/],
  ["tax exemption validity window checked", /tax_exemption_valid_from[\s\S]*tax_exemption_valid_until/],
  ["override requests remain pending manual review", /'pending_review'/],
  ["financial access blocks are security audited", /commercial_financial_access_blocked/],
  ["entitlement decisions are security audited", /commercial_financial_entitlement_evaluated/],
  ["blocked financial decisions are durably recorded", /commercial_financial_decision_events/],
  ["no-store response header", /Cache-Control","no-store"/],
  ["oversized requests rejected", /REQUEST_TOO_LARGE/],
];

const failures = checks.filter(([, pattern]) => !pattern.test(source));
if (failures.length) {
  console.error("Commercial financial policy security regression failures:");
  for (const [label] of failures) console.error(`- ${label}`);
  process.exit(1);
}

console.log(`Commercial financial policy security regression gate passed (${checks.length} invariants).`);
