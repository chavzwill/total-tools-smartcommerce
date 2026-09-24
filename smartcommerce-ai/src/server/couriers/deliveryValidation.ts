import {createHash} from 'node:crypto';
import {CourierError} from './policy.js';
import {seal,validateDocument} from './privateData.js';
const uuid=/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const invalid=()=>{throw new CourierError('COURIER_INVALID_COMMAND');};
export function validateDeliveryCommand(input:unknown):Record<string,unknown>{
  if(!input||typeof input!=='object'||Array.isArray(input))return invalid();
  const c=input as Record<string,unknown>;
  if(Object.keys(c).some(k=>!['action','id','idempotencyKey','expectedVersion','status','reason','reportedAt','proof'].includes(k))||!uuid.test(String(c.id))||!uuid.test(String(c.idempotencyKey)))return invalid();
  if(c.action==='read_proof'){
    if(Object.keys(c).some(k=>!['action','id','idempotencyKey'].includes(k)))return invalid();
    return c;
  }
  if(c.action!=='update_status'||!Number.isSafeInteger(c.expectedVersion)||Number(c.expectedVersion)<0||!['in_transit','out_for_delivery','delivered','delayed','failed_attempt'].includes(String(c.status)))return invalid();
  if(c.reportedAt!==undefined&&(typeof c.reportedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(c.reportedAt)||!Number.isFinite(Date.parse(c.reportedAt))))return invalid();
  if(['delayed','failed_attempt'].includes(String(c.status))){if(!['traffic','weather','vehicle_issue','recipient_unavailable','address_issue','other'].includes(String(c.reason)))return invalid();}
  else if(c.reason!==undefined)return invalid();
  if(c.status==='delivered'){
    const p=c.proof as Record<string,unknown>;
    if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['recipient','mime','data'].includes(k))||typeof p.recipient!=='string'||!p.recipient.trim()||p.recipient.length>120||!['image/jpeg','image/png'].includes(String(p.mime))||typeof p.data!=='string'||p.data.length>2800000)return invalid();
  }else if(c.proof!==undefined)return invalid();
  return c;
}
export function prepareDeliveryCommand(raw:Record<string,unknown>,secret:string):Record<string,unknown>{
  const c={...validateDeliveryCommand(raw)};
  if(c.status==='delivered'){
    if(Buffer.from(secret,'base64').length!==32)throw new CourierError('COURIER_UNAVAILABLE',503);
    const p=c.proof as {recipient:string;mime:string;data:string};
    const bytes=Buffer.from(p.data,'base64');
    if(bytes.toString('base64')!==p.data)invalid();
    try{validateDocument(bytes,p.mime);}catch{throw new CourierError('COURIER_INVALID_DOCUMENT');}
    const payload=Buffer.from(JSON.stringify({recipient:p.recipient.trim(),mime:p.mime,data:p.data}));
    c.proof={encrypted:seal(payload,secret),fingerprint:createHash('sha256').update(payload).digest('hex'),mime:p.mime};
  }
  return c;
}
