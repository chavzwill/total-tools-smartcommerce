export type CommercialApplicationReview = {
  application_id:string; commercial_account_id:string; applicant_customer_id:string;
  claimed_account_type:string; legal_name:string; registration_identifier?:string|null; tax_identifier?:string|null;
  work_email?:string|null; official_domain?:string|null; application_status:string; risk_flags?:string[]|null;
  submitted_at?:string|null; reviewed_at?:string|null; review_reference?:string|null;
  display_name:string; account_status:string; verification_status:string; privilege_status:string;
  applicant_name:string; applicant_email:string; authority_status?:string|null;
  provider_id?:string|null; provider_account_id?:string|null; provider_customer_id?:string|null;
  provider_price_list_id?:string|null; payment_terms_code?:string|null; mapping_status?:string|null;
  financial_control_status?:string|null; credit_enabled?:boolean|null; credit_limit_minor?:number|string|null;
  credit_currency?:string|null; purchase_order_enabled?:boolean|null;
};
type Response = { applications:CommercialApplicationReview[]; staff?:{employeeId:string;username:string;role:string}; error?:{message?:string;code?:string} };
async function request(init?:RequestInit){const res=await fetch('/api/commercial-account-reviews',{credentials:'same-origin',headers:{Accept:'application/json','Content-Type':'application/json',...(init?.headers||{})},...init});const payload=await res.json().catch(()=>({})) as Response;if(!res.ok){const e=new Error(payload.error?.message||'Commercial account review failed.') as Error&{status?:number;code?:string};e.status=res.status;e.code=payload.error?.code;throw e}return payload}
export const listCommercialAccountReviews=()=>request();
export const reviewCommercialApplication=(input:{applicationId:string;reviewAction:'approve'|'reject';reviewReference:string})=>request({method:'POST',body:JSON.stringify({action:'review_application',...input})});
export const verifyCommercialProvider=(input:{accountId:string;providerId:string;providerAccountId:string;providerCustomerId?:string;providerPriceListId?:string;paymentTermsCode?:string;verificationReference:string})=>request({method:'POST',body:JSON.stringify({action:'verify_provider',...input})});
export const approveCommercialFinancialControls=(input:{accountId:string;providerId?:string;creditEnabled:boolean;creditLimitMinor?:number;creditCurrency:string;paymentTermsCode?:string;purchaseOrderEnabled:boolean;reviewReference:string})=>request({method:'POST',body:JSON.stringify({action:'set_financial_controls',...input})});
