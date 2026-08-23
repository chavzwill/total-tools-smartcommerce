export type CustomerRefundReconciliationState="return_in_progress"|"pending"|"verification_pending"|"reconciled";
export type CustomerOrderSummary={
 id:string;reference:string;externalReference?:string|null;purchaseOrderReference?:string|null;description?:string|null;currency:string;totalMinor:number;orderedAt:string;dueAt?:string|null;status:string;sourceCoverage:string;
 fulfilment:{status:string;mode:string;provider?:string|null;serviceLabel?:string|null;collectionPointName?:string|null;scheduledFor?:string|null;trackingReference?:string|null;exceptionMessage?:string|null;completedAt?:string|null};
 deliveryMinor:number;paymentTermsCode?:string|null;commercialAccountId?:string|null;
 returnRequest?:{id:string;status:string;resolution:string;approvedAmountMinor?:number|null;refundReference?:string|null;refundReconciliation?:CustomerRefundReconciliationState|null}|null;
};
type ApiError={error?:{message?:string;code?:string}};
async function json<T>(response:Response):Promise<T>{const payload=await response.json().catch(()=>({}));if(!response.ok){const error=new Error((payload as ApiError)?.error?.message||"Request failed.") as Error&{status?:number;code?:string};error.status=response.status;error.code=(payload as ApiError)?.error?.code;throw error;}return payload as T;}
export async function listCustomerOrders(){return json<{orders:CustomerOrderSummary[]}>(await fetch("/api/customer-orders",{credentials:"include",headers:{Accept:"application/json"}}));}
export async function getCustomerOrder(orderId:string){return json<{order:CustomerOrderSummary}>(await fetch(`/api/customer-orders?orderId=${encodeURIComponent(orderId)}`,{credentials:"include",headers:{Accept:"application/json"}}));}
