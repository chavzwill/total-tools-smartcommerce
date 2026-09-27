import fs from "node:fs";
import path from "node:path";
const root=process.cwd();
const api=fs.readFileSync(path.join(root,"api","commercial-team.ts"),"utf8");
const migration=fs.readFileSync(path.join(root,"database","2026-09-01-commercial-team-management.sql"),"utf8");
const checks=[
 ["individual authenticated session",/customer_sessions[\s\S]*customer_accounts[\s\S]*revoked_at IS NULL/],
 ["same-origin mutations",/method !== "POST"[\s\S]*sameOrigin\(req\)/],
 ["bounded body",/MAX_BODY_BYTES\s*=\s*32_000[\s\S]*BODY_TOO_LARGE/],
 ["hashed invitation tokens",/token_hash[\s\S]*hash\(rawToken\)/],
 ["one-time pending acceptance",/status='accepted'[\s\S]*WHERE id=\$\{invitation\.id\} AND status='pending'/],
 ["verified email binding",/user\.email_verified[\s\S]*INVITATION_EMAIL_MISMATCH/],
 ["expiring invitations",/INTERVAL '72 hours'/],
 ["strong step-up administration",/hasStrongStepUp[\s\S]*STEP_UP_REQUIRED/],
 ["owner and admin manager allowlist",/TEAM_MANAGERS = new Set\(\["owner", "admin"\]\)/],
 ["admin cannot alter owner",/target\.role==="owner" && actor\.role!=="owner"/],
 ["last owner invariant",/LAST_OWNER_PROTECTED/],
 ["self-management lockout protection",/SELF_MANAGEMENT_BLOCKED/],
 ["permission allowlist",/PERMISSIONS\.includes/],
 ["bounded non-negative limits",/Number\.isSafeInteger[\s\S]*parsed < 0/],
 ["audit trail",/commercial_member_invited[\s\S]*commercial_member_authority_updated[\s\S]*commercial_member_suspended/],
 ["security event",/recordSecurityEvent/],
 ["no-store responses",/Cache-Control", "no-store"/],
 ["invitation unique token",/token_hash text NOT NULL UNIQUE/],
 ["one pending invitation per email",/commercial_member_invitation_pending_email_uq[\s\S]*WHERE status = 'pending'/],
 ["member policy FK",/member_id text NOT NULL REFERENCES commercial_account_members\(id\)/],
];
const failures=checks.filter(([,pattern])=>!pattern.test(api+"\n"+migration));
if(failures.length){console.error("Commercial team security regression failures:");for(const [label] of failures)console.error(`- ${label}`);process.exit(1)}
console.log(`Commercial team security regression gate passed (${checks.length} invariants).`);
