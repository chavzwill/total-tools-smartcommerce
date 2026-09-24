import {randomUUID} from 'node:crypto';
import type {CourierActor} from '../../types/courier.js';
import {CourierError,canReviewCouriers} from './policy.js';
type Dependencies={enabled:()=>boolean;actor:(request:any,staff:boolean)=>Promise<CourierActor|null>;limit:(request:any,actor:CourierActor)=>Promise<void>;read:(actor:CourierActor,cursor?:string)=>Promise<unknown>;mutate:(actor:CourierActor,command:Record<string,unknown>)=>Promise<unknown>};
const ownerActions=['create_application','save_application','submit_application','save_service','publish_service','pause_service'];
const staffActions=['approve','reject','suspend','reinstate'];
const uuid=/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
export function validateCommand(input:unknown,staff:boolean):Record<string,unknown>{
  if(!input||typeof input!=='object'||Array.isArray(input))throw new CourierError('COURIER_INVALID_COMMAND');
  const d=input as Record<string,unknown>;
  if(Object.keys(d).some(k=>!['action','id','organizationId','expectedVersion','input','reason','idempotencyKey'].includes(k)))throw new CourierError('COURIER_INVALID_COMMAND');
  if(typeof d.action!=='string'||!(staff?staffActions:ownerActions).includes(d.action))throw new CourierError('COURIER_FORBIDDEN',403);
  if(!uuid.test(String(d.id||''))||!uuid.test(String(d.idempotencyKey||'')))throw new CourierError('COURIER_INVALID_COMMAND');
  if(d.action!=='create_application'&&(!Number.isSafeInteger(d.expectedVersion)||Number(d.expectedVersion)<0))throw new CourierError('COURIER_INVALID_COMMAND');
  if(d.action.endsWith('_service')&&!uuid.test(String(d.organizationId||'')))throw new CourierError('COURIER_INVALID_COMMAND');
  if(staff&&(typeof d.reason!=='string'||!d.reason.trim()||d.reason.length>1000))throw new CourierError('COURIER_REASON_REQUIRED');
  return d;
}
export function createCourierHandler(deps:Dependencies,staff=false,options:{validate?:(input:unknown,staff:boolean)=>Record<string,unknown>;bodyLimit?:number;authorizeStaff?:(actor:CourierActor)=>boolean}={}){return async(request:any,response:any)=>{
  const correlationId=randomUUID();
  const send=(status:number,payload:unknown)=>{response.statusCode=status;response.setHeader('Content-Type','application/json');response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('X-Request-Id',correlationId);response.end(JSON.stringify(payload));};
  try{
    if(!deps.enabled())throw new CourierError('COURIER_UNAVAILABLE',503);
    if(!['GET','POST'].includes(request.method))throw new CourierError('COURIER_METHOD_NOT_ALLOWED',405);
    const actor=await deps.actor(request,staff);if(!actor)throw new CourierError('COURIER_SIGN_IN_REQUIRED',401);
    if(staff?(actor.kind!=='staff'||!(options.authorizeStaff||canReviewCouriers)(actor)):actor.kind!=='owner')throw new CourierError('COURIER_FORBIDDEN',403);
    await deps.limit(request,actor);
    if(request.method==='GET')return send(200,await deps.read(actor,new URL(request.url,'http://local').searchParams.get('cursor')||undefined));
    const origin=request.headers?.origin,host=request.headers?.host;
    let sameOrigin=false;
    try{const expected=process.env.SMARTCOMMERCE_PUBLIC_ORIGIN;const url=new URL(origin);sameOrigin=expected?url.origin===new URL(expected).origin:url.host===host&&url.protocol==='http:'&&/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)&&process.env.NODE_ENV!=='production';}catch{/* fail closed */}
    if(!sameOrigin)throw new CourierError('COURIER_FORBIDDEN',403);
    if(!String(request.headers?.['content-type']||'').toLowerCase().startsWith('application/json'))throw new CourierError('COURIER_INVALID_COMMAND');
    const chunks:Buffer[]=[];let size=0;
    for await(const chunk of request){const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=b.length;if(size>(options.bodyLimit||65536))throw new CourierError('COURIER_BODY_TOO_LARGE',413);chunks.push(b);}
    let input:unknown;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new CourierError('COURIER_INVALID_COMMAND');}
    return send(200,await deps.mutate(actor,(options.validate||validateCommand)(input,staff)));
  }catch(error){
    const known=error instanceof CourierError;const status=known?error.status:(error as {status?:number})?.status===429?429:503;
    const code=known?error.code:status===429?'COURIER_RATE_LIMITED':'COURIER_UNAVAILABLE';
    const messages:Record<number,string>={400:'Check the application or service details and try again.',401:'Sign in to manage your courier account.',403:'You do not have permission for this action.',404:'The courier record is unavailable.',409:'This record changed, or this request was already used with different details. Refresh before trying again.',413:'This request is too large.',429:'Too many requests. Please try again shortly.',503:'Courier services are temporarily unavailable. Please try again later.'};
    return send(status,{error:{code,message:code==='COURIER_POS_AUTHORITY_REQUIRED'?'Complete this staff decision in the POS. Approval synchronization is pending.':code==='COURIER_POS_VERIFICATION_PENDING'?'POS verification is not connected yet. Delivery access remains unavailable.':messages[status]||'This action is unavailable.',correlationId}});
  }
};}
