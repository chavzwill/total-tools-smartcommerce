import {CourierClientError} from './couriers';
export async function courierPrivateRequest(staff=false,command?:Record<string,unknown>,cursor?:string):Promise<any>{
  const response=await fetch(`/api/${staff?'courier-review':'courier-private'}${cursor?'?cursor='+encodeURIComponent(cursor):''}`,{method:command?'POST':'GET',credentials:'same-origin',headers:{Accept:'application/json',...(command?{'Content-Type':'application/json'}:{})},...(command?{body:JSON.stringify(command)}:{})});
  const data=await response.json().catch(()=>null);if(!response.ok||!data||data.error)throw new CourierClientError(response.ok?503:response.status,data?.error?.code);
  return command?data.result:data;
}
export function downloadCourierDocument(result:{data:string;mime:string}){
  const bytes=Uint8Array.from(atob(result.data),c=>c.charCodeAt(0));
  const url=URL.createObjectURL(new Blob([bytes],{type:result.mime}));
  const a=document.createElement('a');a.href=url;a.download='courier-verification-document'+(result.mime==='application/pdf'?'.pdf':result.mime==='image/png'?'.png':'.jpg');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
