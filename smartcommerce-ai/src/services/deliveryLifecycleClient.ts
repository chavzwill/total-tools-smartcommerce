export type DeliveryStatus = "order_received"|"preparing"|"ready_for_collection"|"dispatched"|"out_for_delivery"|"delivered"|"collected"|"exception";
export type DeliveryProofMethod = "recipient_acknowledgement"|"signed_docket"|"photo_evidence"|"courier_confirmation"|"collection_receipt";

export type CustomerTracking = {
  orderId:string; status:DeliveryStatus; fulfilmentMode:string; provider?:string|null; serviceLabel?:string|null; collectionPointName?:string|null;
  scheduledFor?:string|null; trackingReference?:string|null; exceptionMessage?:string|null; completedAt?:string|null; proofRecipientName?:string|null; proofMethod?:DeliveryProofMethod|null; proofReference?:string|null;
  events:Array<{status:DeliveryStatus;message?:string|null;at:string}>;
  notifications?:Array<{id:string;status:DeliveryStatus;message:string;readAt?:string|null;createdAt:string}>;
};

export type StaffDelivery = {
  id:string; order_id:string; customer_id:string; commercial_account_id?:string|null; fulfilment_mode:string; provider?:string|null; service_id?:string|null;
  service_label?:string|null; collection_point_name?:string|null; status:DeliveryStatus; scheduled_for?:string|null; tracking_reference?:string|null;
  exception_message?:string|null; completed_at?:string|null; proof_recipient_name?:string|null; proof_method?:DeliveryProofMethod|null; proof_reference?:string|null; updated_at:string; created_at:string;
};

type ErrorPayload={error?:{code?:string;message?:string}};
async function parse<T>(response:Response){const payload=await response.json().catch(()=>({})) as T&ErrorPayload;if(!response.ok){const error=new Error(payload.error?.message||"Request failed.") as Error&{code?:string;status?:number};error.code=payload.error?.code;error.status=response.status;throw error;}return payload as T;}

export async function getCustomerDeliveryTracking(orderId:string){
  return parse<{tracking:CustomerTracking}>(await fetch(`/api/customer-delivery-tracking?orderId=${encodeURIComponent(orderId)}`,{credentials:"same-origin",headers:{Accept:"application/json"}}));
}
export async function listStaffDeliveries(status="all"){
  return parse<{deliveries:StaffDelivery[]}>(await fetch(`/api/delivery-lifecycle?status=${encodeURIComponent(status)}`,{credentials:"same-origin",headers:{Accept:"application/json"}}));
}
export async function updateStaffDelivery(input:{orderId:string;status:DeliveryStatus;publicMessage?:string;internalNote?:string;provider?:string;serviceLabel?:string;trackingReference?:string;scheduledFor?:string;exceptionMessage?:string;proofRecipientName?:string;proofMethod?:DeliveryProofMethod;proofReference?:string;proofNotes?:string}){
  return parse<{delivery:StaffDelivery;notificationsQueued?:number}>(await fetch("/api/delivery-lifecycle",{method:"PATCH",credentials:"same-origin",headers:{Accept:"application/json","Content-Type":"application/json"},body:JSON.stringify(input)}));
}
