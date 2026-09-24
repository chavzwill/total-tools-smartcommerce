const uuid=/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
export function validateDispatchCommand(input:unknown):Record<string,unknown>{
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('COURIER_INVALID_COMMAND');
 const d=input as Record<string,unknown>;
 if(Object.keys(d).some(k=>!['action','id','idempotencyKey','expectedVersion','reason','driverId'].includes(k))||!['accept','decline','assign'].includes(String(d.action))||!uuid.test(String(d.id||''))||!uuid.test(String(d.idempotencyKey||''))||!Number.isSafeInteger(d.expectedVersion)||Number(d.expectedVersion)<1)throw new Error('COURIER_INVALID_COMMAND');
 if(d.action==='decline'&&!['capacity','vehicle_unavailable','coverage_issue','other'].includes(String(d.reason)))throw new Error('COURIER_REASON_REQUIRED');
 if(d.action==='assign'&&!uuid.test(String(d.driverId||'')))throw new Error('COURIER_INVALID_COMMAND');
 if((d.action!=='assign'&&d.driverId!==undefined)||(d.action!=='decline'&&d.reason!==undefined))throw new Error('COURIER_INVALID_COMMAND');
 return d;
}
