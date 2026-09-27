import {neon, type NeonQueryFunction} from '@neondatabase/serverless';
import type {CourierActor,CourierReferences} from '../../types/courier.js';
import {CourierError,normalizeApplication,canReviewCouriers} from './policy.js';
import {normalizeCourierService} from './serviceValidation.js';
let client:NeonQueryFunction<false,false>|undefined;
export function courierDb(){if(!client){const url=process.env.SMARTCOMMERCE_DATABASE_URL||process.env.DATABASE_URL;if(!url)throw new CourierError('COURIER_UNAVAILABLE',503);client=neon(url);}return client;}
export async function getReferences():Promise<CourierReferences>{
  const rows=await courierDb()`SELECT kind,id,name FROM courier_references WHERE active ORDER BY kind,name LIMIT 3001`;
  if(rows.length>3000)throw new CourierError('COURIER_UNAVAILABLE',503);
  const list=(kind:string)=>rows.filter(r=>r.kind===kind).map(r=>({id:String(r.id),name:String(r.name)}));
  return {areas:list('area'),categories:list('category'),collectionPoints:list('collection_point'),currencies:list('currency').map(r=>r.id)};
}
export async function readCourierWorkspace(actor:CourierActor,cursor?:string){
  const db=courierDb();
  if(actor.kind==='staff'){
    if(!canReviewCouriers(actor))throw new CourierError('COURIER_FORBIDDEN',403);
    if(cursor&&!/^[a-f\d-]{36}$/i.test(cursor))throw new CourierError('COURIER_INVALID_CURSOR');
    const rows=await db`SELECT courier_application_json(o) || jsonb_build_object('history',COALESCE((SELECT jsonb_agg(e.entry ORDER BY e.id DESC) FROM (SELECT id,jsonb_build_object('action',action,'reason',reason,'createdAt',created_at,'version',version) AS entry FROM courier_events WHERE organization_id=o.id ORDER BY id DESC LIMIT 20) e),'[]'::jsonb)) AS application FROM courier_organizations o WHERE (${cursor||null}::uuid IS NULL OR o.id>${cursor||null}::uuid) ORDER BY o.id LIMIT 51`;
    const applications=rows.slice(0,50).map(r=>r.application);
    return {applications,nextCursor:rows.length>50?applications[49].id:null};
  }
  const rows=await db`SELECT courier_application_json(o) AS application FROM courier_organizations o WHERE owner_customer_id::text=${actor.customerId} LIMIT 1`;
  const application=rows[0]?.application||null;
  const services=application?await db`SELECT jsonb_build_object('id',s.id,'organizationId',s.organization_id,'version',s.version,'published',s.published,'input',s.input) AS service FROM courier_services s JOIN courier_organizations o ON o.id=s.organization_id WHERE o.owner_customer_id::text=${actor.customerId} ORDER BY s.updated_at DESC LIMIT 50`:[];
  const events=application?await db`SELECT action,old_status AS "oldStatus",new_status AS "newStatus",reason,version,created_at AS "createdAt" FROM courier_events WHERE organization_id=${application.id}::uuid ORDER BY id DESC LIMIT 100`:[];
  return {application,services:services.map(r=>r.service),references:await getReferences(),events,bookingAvailable:false};
}
export async function mutateCourier(actor:CourierActor,raw:Record<string,unknown>){
  const command={...raw},action=String(command.action),db=courierDb();
  if(['create_application','save_application'].includes(action))command.input=normalizeApplication(command.input);
  if(action==='save_service')command.input=normalizeCourierService(command.input,await getReferences());
  if(action==='publish_service'){
    if(actor.kind!=='owner')throw new CourierError('COURIER_FORBIDDEN',403);
    const rows=await db`SELECT s.input FROM courier_services s JOIN courier_organizations o ON o.id=s.organization_id WHERE s.id=${command.id}::uuid AND o.owner_customer_id::text=${actor.customerId}`;
    if(!rows.length)throw new CourierError('COURIER_NOT_FOUND',404);
    normalizeCourierService(rows[0].input,await getReferences());
  }
  try{
    const rows=action.endsWith('_service')&&actor.kind==='owner'
      ?await db`SELECT courier_service_mutate(${actor.customerId},${JSON.stringify(command)}::jsonb) AS result`
      :await db`SELECT courier_mutate(${JSON.stringify(actor)}::jsonb,${JSON.stringify(command)}::jsonb) AS result`;
    return {result:rows[0].result};
  }catch(error){
    const code=(error as {message?:string})?.message;
    const known:Record<string,number>={COURIER_VERIFICATION_REQUIRED:409,COURIER_FORBIDDEN:403,COURIER_NOT_FOUND:404,COURIER_STATE_CONFLICT:409,COURIER_IDEMPOTENCY_CONFLICT:409,COURIER_NOT_APPROVED:409,COURIER_SERVICE_LIMIT:400,COURIER_REASON_REQUIRED:400,COURIER_INVALID_COMMAND:400};
    if(code&&known[code])throw new CourierError(code,known[code]);
    if((error as {code?:string})?.code==='23505')throw new CourierError('COURIER_STATE_CONFLICT',409);
    throw new CourierError('COURIER_UNAVAILABLE',503);
  }
}
