import {CourierClientError} from './couriers';
export type DeliveryAudience='courier'|'customer'|'staff';
export type DeliveryRecord={id:string;orderNumber:string;status:string;version:number;updatedAt:string|null;canUpdate:boolean;hasProof:boolean;items:Array<{name?:string;sku?:string;quantity:number}>;destination:Record<string,unknown>;events:Array<{event:string;status:string;reason:string|null;reportedAt:string;receivedAt:string;version:number}>};
export type DeliveryPage={deliveries:DeliveryRecord[];nextCursor:string|null;checkedAt:string};
export async function deliveryRequest(audience:DeliveryAudience,command?:Record<string,unknown>,cursor?:string,signal?:AbortSignal):Promise<any>{
  const response=await fetch(`/api/${audience==='courier'?'courier':audience==='staff'?'staff':'customer'}-deliveries${cursor?'?cursor='+encodeURIComponent(cursor):''}`,{method:command?'POST':'GET',credentials:'same-origin',signal,headers:{Accept:'application/json',...(command?{'Content-Type':'application/json'}:{})},...(command?{body:JSON.stringify(command)}:{})});
  const data=await response.json().catch(()=>null);
  if(!response.ok||!data||data.error)throw new CourierClientError(response.ok?503:response.status);
  if(command){if(!data.result||typeof data.result!=='object')throw new CourierClientError(503);return data.result;}
  if(!Array.isArray(data.deliveries)||typeof data.checkedAt!=='string'||(data.nextCursor!==null&&typeof data.nextCursor!=='string')||data.deliveries.some((d:any)=>typeof d.id!=='string'||typeof d.orderNumber!=='string'||typeof d.status!=='string'||!Number.isSafeInteger(d.version)||typeof d.canUpdate!=='boolean'||typeof d.hasProof!=='boolean'||!Array.isArray(d.items)||!Array.isArray(d.events)||!d.destination||typeof d.destination!=='object'))throw new CourierClientError(503);
  return data as DeliveryPage;
}
