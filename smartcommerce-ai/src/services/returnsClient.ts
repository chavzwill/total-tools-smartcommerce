export type ReturnRequest = {
  id:string; customer_id:string; order_id:string; commercial_account_id?:string|null; status:string;
  requested_resolution:string; reason:string; item_summary?:string|null; customer_notes?:string|null;
  currency:string; requested_amount_minor?:number|null; approved_amount_minor?:number|null;
  provider_return_id?:string|null; refund_reference?:string|null; staff_notes?:string|null;
  reviewed_by?:string|null; reviewed_at?:string|null; created_at:string; updated_at:string;
};

type ApiError={error?:{message?:string;code?:string}};
async function json<T>(response:Response):Promise<T>{const payload=await response.json().catch(()=>({}));if(!response.ok){const error=new Error((payload as ApiError)?.error?.message||"Request failed.") as Error & {status?:number;code?:string};error.status=response.status;error.code=(payload as ApiError)?.error?.code;throw error;}return payload as T;}

export async function listCustomerReturns(){return json<{returns:ReturnRequest[]}>(await fetch("/api/customer-returns",{credentials:"include",headers:{Accept:"application/json"}}));}
export async function createCustomerReturn(input:{orderId:string;requestedResolution:string;reason:string;itemSummary?:string;customerNotes?:string;requestedAmountMinor?:number}){return json<{return:ReturnRequest}>(await fetch("/api/customer-returns",{method:"POST",credentials:"include",headers:{Accept:"application/json","Content-Type":"application/json"},body:JSON.stringify(input)}));}
export async function listStaffReturns(status="requested"){return json<{returns:ReturnRequest[];staff:any}>(await fetch(`/api/return-reviews?status=${encodeURIComponent(status)}`,{credentials:"include",headers:{Accept:"application/json"}}));}
export async function updateStaffReturn(input:{id:string;action:string;approvedAmountMinor?:number;providerReturnId?:string;refundReference?:string;staffNotes?:string;publicMessage?:string}){return json<{return:ReturnRequest}>(await fetch("/api/return-reviews",{method:"POST",credentials:"include",headers:{Accept:"application/json","Content-Type":"application/json"},body:JSON.stringify(input)}));}
