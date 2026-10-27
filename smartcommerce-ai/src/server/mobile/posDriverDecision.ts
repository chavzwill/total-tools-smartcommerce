import {createHmac,timingSafeEqual} from 'node:crypto';
export type DriverDecision={eventId:string;source:'total_tools_pos';entityType:'courier_driver';eventType:'courier_driver.decision';entityId:string;entityVersion:number;occurredAt:string;correlationId:string;payload:{driverId:string;organizationId:string;accountId:string;posOrganizationId:string;organizationStatus:'approved'|'suspended'|'rejected';driverStatus:'approved'|'suspended'|'revoked';actorId:string;reason:string;validUntil:string}};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,max=200):v is string=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=max&&!/[\x00-\x1f]/.test(v);
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k));
export function parseDriverDecision(value:unknown,now=Date.now()):DriverDecision|null{
 if(!object(value)||!exact(value,['eventId','source','entityType','eventType','entityId','entityVersion','occurredAt','correlationId','payload']))return null;
 if(!text(value.eventId)||!text(value.entityId)||!text(value.correlationId)||value.source!=='total_tools_pos'||value.entityType!=='courier_driver'||value.eventType!=='courier_driver.decision'||!Number.isSafeInteger(value.entityVersion)||Number(value.entityVersion)<1)return null;
 const p=value.payload;if(!object(p)||!exact(p,['driverId','organizationId','accountId','posOrganizationId','organizationStatus','driverStatus','actorId','reason','validUntil']))return null;
 if(!uuid(p.driverId)||!uuid(p.organizationId)||!text(p.accountId)||!text(p.posOrganizationId)||!text(p.actorId)||!text(p.reason,1000)||typeof p.organizationStatus!=='string'||!['approved','suspended','rejected'].includes(p.organizationStatus)||typeof p.driverStatus!=='string'||!['approved','suspended','revoked'].includes(p.driverStatus))return null;
 const occurred=typeof value.occurredAt==='string'?Date.parse(value.occurredAt):NaN,until=typeof p.validUntil==='string'?Date.parse(p.validUntil):NaN;
 if(!Number.isFinite(occurred)||!Number.isFinite(until)||occurred>now+60000||until<=now||until<=occurred||until-occurred>900000)return null;
 return value as unknown as DriverDecision;
}
type Result={disposition:'applied'|'replayed'|'stale'|'conflict'|'blocked'};
export function createPosDriverHandler(deps:{enabled:()=>boolean;secret:()=>string;now?:()=>number;apply:(e:DriverDecision)=>Promise<Result>}){return async(req:any,res:any)=>{
 res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 const send=(status:number,payload:unknown)=>{res.statusCode=status;res.end(JSON.stringify(payload));};
 const fail=(status:number,code:string)=>send(status,{error:{code,message:'POS courier decision could not be accepted.',retryable:status===503}});
 try{
  if(req.method!=='POST'){res.setHeader('Allow','POST');return fail(405,'METHOD_NOT_ALLOWED');}
  const secret=deps.secret();if(!deps.enabled()||secret.length<32)return fail(503,'POS_DRIVER_NOT_CONFIGURED');
  const chunks:Buffer[]=[];let size=0;for await(const chunk of req){const b=Buffer.from(chunk);size+=b.length;if(size>16384)return fail(413,'REQUEST_TOO_LARGE');chunks.push(b);}const raw=Buffer.concat(chunks);
  const timestamp=req.headers?.['x-pos-timestamp'],signature=req.headers?.['x-pos-signature'];const now=(deps.now||Date.now)();
  if(typeof timestamp!=='string'||!/^\d{10}$/.test(timestamp)||Math.abs(now/1000-Number(timestamp))>300||typeof signature!=='string'||! /^(?:sha256=)?[a-f0-9]{64}$/i.test(signature))return fail(401,'POS_SIGNATURE_INVALID');
  const expected=createHmac('sha256',secret).update(timestamp).update('.').update(raw).digest();
  if(!timingSafeEqual(expected,Buffer.from(signature.replace(/^sha256=/i,''),'hex')))return fail(401,'POS_SIGNATURE_INVALID');
  let value:unknown;try{value=JSON.parse(raw.toString('utf8'));}catch{return fail(400,'INVALID_JSON');}
  const event=parseDriverDecision(value,now);if(!event)return fail(400,'INVALID_DRIVER_DECISION');
  const result=await deps.apply(event);return send(result.disposition==='applied'?202:['conflict','blocked'].includes(result.disposition)?409:200,{eventId:event.eventId,status:result.disposition});
 }catch{return fail(503,'POS_DRIVER_UNAVAILABLE');}
};}
