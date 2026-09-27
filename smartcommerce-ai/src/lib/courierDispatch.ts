import {CourierClientError} from './couriers';
export type DispatchJob={id:string;orderNumber:string;branchId:string;status:string;acceptance:string;deadline:string;version:number;reason:string|null;attention:boolean};
export type DispatchPage={jobs:DispatchJob[];nextCursor:string|null;checkedAt:string};
export async function dispatchRequest(staff:boolean,command?:Record<string,unknown>,cursor?:string,signal?:AbortSignal):Promise<DispatchPage|{id:string;version:number}>{
 const response=await fetch('/api/'+(staff?'staff-dispatch':'courier-dispatch')+(cursor?'?cursor='+encodeURIComponent(cursor):''),{method:command?'POST':'GET',credentials:'same-origin',signal,headers:{Accept:'application/json',...(command?{'Content-Type':'application/json'}:{})},...(command?{body:JSON.stringify(command)}:{})});
 const data=await response.json().catch(()=>null);if(!response.ok)throw new CourierClientError(response.status,data?.error?.code);
 if(command){if(!data?.result?.id||!Number.isInteger(data.result.version))throw new CourierClientError(503);return data.result;}
 if(!data||!Array.isArray(data.jobs)||!Number.isFinite(Date.parse(data.checkedAt))||data.jobs.some((j:any)=>typeof j.id!=='string'||!Number.isInteger(j.version)||typeof j.orderNumber!=='string'||typeof j.status!=='string'||typeof j.acceptance!=='string'||!Number.isFinite(Date.parse(j.deadline))))throw new CourierClientError(503);
 return data;
}
