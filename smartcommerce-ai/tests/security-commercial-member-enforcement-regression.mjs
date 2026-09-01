import fs from "node:fs";
import path from "node:path";
const root=process.cwd();
const read=(file)=>fs.readFileSync(path.join(root,file),"utf8");
const helper=read("src/server/commercialMemberAuthorization.ts");
const checkout=read("api/commercial-credit-checkout.ts");
const account=read("api/commercial-account.ts");
const accounting=read("api/commercial-accounting.ts");
const policy=read("api/commercial-financial-policy.ts");
const checks=[
 ["central permission allowlist",/COMMERCIAL_PERMISSIONS[\s\S]*use_company_credit[\s\S]*rental_authority[\s\S]*repair_service_authority/],
 ["active membership required",/m\.status='active'/],
 ["role defaults merged with overrides",/permissions:\\{\.\.\.commercialRoleDefaults\\(row\\.role\\),\.\.\.overrides\\}/],
 ["per-order limit",/spendLimitOrderMinor[\s\S]*member_order_limit_exceeded/],
 ["daily spend aggregation",/date_trunc\('day',NOW\(\)\)[\s\S]*member_daily_limit_exceeded/],
 ["monthly spend aggregation",/date_trunc\('month',NOW\(\)\)[\s\S]*member_monthly_limit_exceeded/],
 ["customer scoped spend",/commercial_account_id=\$\{accountId\}[\s\S]*customer_id=\$\{customerId\}/],
 ["credit checkout place-order permission",/hasCommercialPermission\(memberAuthority, "place_orders"\)/],
 ["credit checkout company-credit permission",/hasCommercialPermission\(memberAuthority, "use_company_credit"\)/],
 ["purchase-order submission permission",/hasCommercialPermission\(memberAuthority, "submit_purchase_orders"\)/],
 ["checkout member spend evaluation",/evaluateCommercialSpend[\s\S]*COMMERCIAL_MEMBER_SPEND_LIMIT/],
 ["checkout denied decisions audited",/member_permission_denied[\s\S]*member_order_limit|COMMERCIAL_MEMBER_SPEND_LIMIT/],
 ["site authority enforced",/hasCommercialPermission\(authority, "manage_job_sites"\)/],
 ["invoice and statement authority enforced",/hasCommercialPermission\(memberAuthority, "view_invoices"\)/],
 ["financial capability permission map",/purchase_order:"submit_purchase_orders"[\s\S]*credit:"use_company_credit"/],
 ["override approval permission",/hasCommercialPermission\(authority,"approve_purchases"\)/],
];
const source=[helper,checkout,account,accounting,policy].join("\n");
const failures=checks.filter(([,pattern])=>!pattern.test(source));
if(failures.length){console.error("Commercial member enforcement regression failures:");for(const [label] of failures)console.error(`- ${label}`);process.exit(1)}
console.log(`Commercial member enforcement regression gate passed (${checks.length} invariants).`);
