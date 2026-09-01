export type CommercialPermission =
  | "view_pricing" | "place_orders" | "create_requisitions" | "submit_purchase_orders"
  | "use_company_credit" | "approve_purchases" | "manage_job_sites" | "view_invoices"
  | "make_account_payments" | "view_order_history" | "manage_users" | "receive_deliveries"
  | "rental_authority" | "repair_service_authority";

export type CommercialTeamMember = {
  id: string; customer_id: string; full_name: string; email?: string | null;
  role: "owner" | "admin" | "approver" | "buyer"; status: string; authority_status: string;
  permissions: Record<CommercialPermission, boolean>; permission_overrides?: Partial<Record<CommercialPermission, boolean>>;
  spend_limit_order_minor?: string | number | null; spend_limit_day_minor?: string | number | null;
  spend_limit_month_minor?: string | number | null; approval_limit_minor?: string | number | null; currency?: string | null;
};
export type CommercialTeam = { canManage: boolean; members: CommercialTeamMember[]; invitations: Array<{id:string;invited_email:string;role:string;status:string;expires_at:string}> };
type ErrorPayload={error?:{code?:string;message?:string}};
async function request<T>(url:string,init?:RequestInit){
  const response=await fetch(url,{credentials:"same-origin",headers:{Accept:"application/json","Content-Type":"application/json",...(init?.headers||{})},...init});
  const payload=await response.json().catch(()=>({})) as T&ErrorPayload;
  if(!response.ok){const error=new Error(payload.error?.message||"Commercial team request failed.") as Error&{code?:string;status?:number};error.code=payload.error?.code;error.status=response.status;throw error}
  return payload;
}
export const getCommercialTeam=(accountId:string)=>request<CommercialTeam>(`/api/commercial-team?accountId=${encodeURIComponent(accountId)}`);
export const getCommercialInvitation=(token:string)=>request<{invitation:{accountId:string;displayName:string;role:string;emailMatches:boolean;expiresAt:string}}>(`/api/commercial-team?token=${encodeURIComponent(token)}`);
export const acceptCommercialInvitation=(token:string)=>request<{accepted:true;accountId:string}>("/api/commercial-team",{method:"POST",body:JSON.stringify({action:"accept_invitation",token})});
export const inviteCommercialMember=(input:{accountId:string;email:string;role:string;permissionOverrides?:Record<string,boolean>;spendLimitOrderMinor?:number|null;spendLimitDayMinor?:number|null;spendLimitMonthMinor?:number|null;approvalLimitMinor?:number|null;currency?:string})=>request<{invitation:{id:string;acceptUrl:string;expiresInHours:number}}>("/api/commercial-team",{method:"POST",body:JSON.stringify({action:"invite_member",...input})});
export const updateCommercialMember=(input:{accountId:string;memberId:string;role:string;permissionOverrides?:Record<string,boolean>;spendLimitOrderMinor?:number|null;spendLimitDayMinor?:number|null;spendLimitMonthMinor?:number|null;approvalLimitMinor?:number|null;currency?:string})=>request<{team:CommercialTeam}>("/api/commercial-team",{method:"POST",body:JSON.stringify({action:"update_member",...input})});
export const changeCommercialMemberStatus=(accountId:string,memberId:string,action:"suspend_member"|"revoke_member"|"reactivate_member")=>request<{team:CommercialTeam}>("/api/commercial-team",{method:"POST",body:JSON.stringify({action,accountId,memberId})});
