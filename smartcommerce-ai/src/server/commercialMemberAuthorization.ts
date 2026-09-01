export const COMMERCIAL_PERMISSIONS = [
  "view_pricing", "place_orders", "create_requisitions", "submit_purchase_orders",
  "use_company_credit", "approve_purchases", "manage_job_sites", "view_invoices",
  "make_account_payments", "view_order_history", "manage_users", "receive_deliveries",
  "rental_authority", "repair_service_authority",
] as const;
export type CommercialPermission = typeof COMMERCIAL_PERMISSIONS[number];
export type CommercialMemberAuthority = {
  memberId:string; role:string; status:string; authorityStatus:string;
  permissions:Record<CommercialPermission,boolean>;
  spendLimitOrderMinor:number|null; spendLimitDayMinor:number|null; spendLimitMonthMinor:number|null;
  approvalLimitMinor:number|null; currency:string;
};
type SqlTag=any;
const empty=()=>Object.fromEntries(COMMERCIAL_PERMISSIONS.map((p)=>[p,false])) as Record<CommercialPermission,boolean>;
export function commercialRoleDefaults(role:string){
  const value=empty();
  const allow=(...permissions:CommercialPermission[])=>{for(const permission of permissions)value[permission]=true};
  if(role==="owner"||role==="admin")allow(...COMMERCIAL_PERMISSIONS);
  else if(role==="approver")allow("view_pricing","place_orders","create_requisitions","submit_purchase_orders","use_company_credit","approve_purchases","manage_job_sites","view_invoices","view_order_history","receive_deliveries","rental_authority","repair_service_authority");
  else if(role==="buyer")allow("view_pricing","place_orders","create_requisitions","submit_purchase_orders","manage_job_sites","view_order_history","receive_deliveries","rental_authority","repair_service_authority");
  return value;
}
export async function getCommercialMemberAuthority(db:SqlTag,customerId:string,accountId:string):Promise<CommercialMemberAuthority|undefined>{
  const rows=await db`
    SELECT m.id,m.role,m.status,m.authority_status,p.permission_overrides,
      p.spend_limit_order_minor,p.spend_limit_day_minor,p.spend_limit_month_minor,p.approval_limit_minor,
      COALESCE(p.currency,'JMD') AS currency
    FROM commercial_account_members m
    LEFT JOIN commercial_member_policies p ON p.member_id=m.id AND p.commercial_account_id=m.commercial_account_id
    WHERE m.customer_id=${customerId} AND m.commercial_account_id=${accountId} AND m.status='active' LIMIT 1
  ` as any[];
  const row=rows[0];if(!row)return undefined;
  const overrides=row.permission_overrides&&typeof row.permission_overrides==="object"?row.permission_overrides:{};
  return {memberId:row.id,role:row.role,status:row.status,authorityStatus:row.authority_status,permissions:{...commercialRoleDefaults(row.role),...overrides},spendLimitOrderMinor:row.spend_limit_order_minor==null?null:Number(row.spend_limit_order_minor),spendLimitDayMinor:row.spend_limit_day_minor==null?null:Number(row.spend_limit_day_minor),spendLimitMonthMinor:row.spend_limit_month_minor==null?null:Number(row.spend_limit_month_minor),approvalLimitMinor:row.approval_limit_minor==null?null:Number(row.approval_limit_minor),currency:String(row.currency||"JMD").toUpperCase()};
}
export function hasCommercialPermission(authority:CommercialMemberAuthority|undefined,permission:CommercialPermission){
  return Boolean(authority?.status==="active"&&authority.permissions[permission]);
}
export async function commercialSpendUsage(db:SqlTag,customerId:string,accountId:string,currency:string){
  const rows=await db`
    SELECT
      COALESCE(SUM(debit_minor) FILTER (WHERE occurred_at>=date_trunc('day',NOW())),0)::bigint AS day_minor,
      COALESCE(SUM(debit_minor) FILTER (WHERE occurred_at>=date_trunc('month',NOW())),0)::bigint AS month_minor
    FROM commercial_account_ledger_entries
    WHERE commercial_account_id=${accountId} AND customer_id=${customerId}
      AND entry_type='order_charge' AND currency=${currency} AND status NOT IN ('cancelled','rejected','refunded')
  ` as any[];
  return {dayMinor:Number(rows[0]?.day_minor||0),monthMinor:Number(rows[0]?.month_minor||0)};
}
export async function evaluateCommercialSpend(db:SqlTag,authority:CommercialMemberAuthority,customerId:string,accountId:string,amountMinor:number,currency:string){
  if(!Number.isSafeInteger(amountMinor)||amountMinor<0)return {allowed:false,reason:"invalid_amount"} as const;
  if(authority.currency!==currency)return {allowed:false,reason:"member_limit_currency_mismatch"} as const;
  if(authority.spendLimitOrderMinor!==null&&amountMinor>authority.spendLimitOrderMinor)return {allowed:false,reason:"member_order_limit_exceeded"} as const;
  const usage=await commercialSpendUsage(db,customerId,accountId,currency);
  if(authority.spendLimitDayMinor!==null&&usage.dayMinor+amountMinor>authority.spendLimitDayMinor)return {allowed:false,reason:"member_daily_limit_exceeded",usage} as const;
  if(authority.spendLimitMonthMinor!==null&&usage.monthMinor+amountMinor>authority.spendLimitMonthMinor)return {allowed:false,reason:"member_monthly_limit_exceeded",usage} as const;
  return {allowed:true,reason:"within_member_limits",usage} as const;
}
