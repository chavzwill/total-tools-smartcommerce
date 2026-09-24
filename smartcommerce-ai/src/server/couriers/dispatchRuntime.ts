import {createCourierHandler} from './http.js';
import {courierAuthorityError} from './authority.js';
import {courierActor} from './runtime.js';
import {courierDb} from './repository.js';
import {CourierError} from './policy.js';
import {validateDispatchCommand} from './dispatchValidation.js';
import {enforceDurableRateLimit} from '../securityInfrastructure.js';
function safe(error:unknown):never{
 const code=(error as Error).message;
 const statuses:Record<string,number>={COURIER_NOT_FOUND:404,COURIER_FORBIDDEN:403,COURIER_STATE_CONFLICT:409,COURIER_IDEMPOTENCY_CONFLICT:409,COURIER_ACCEPTANCE_REQUIRED:409,COURIER_DRIVER_UNAVAILABLE:409,COURIER_VERIFICATION_REQUIRED:409};
 throw new CourierError(statuses[code]?code:'COURIER_UNAVAILABLE',statuses[code]||503);
}
export function dispatchHandler(staff=false){return createCourierHandler({
 enabled:()=>process.env.SMARTCOMMERCE_COURIERS_ENABLED==='true',actor:courierActor,
 async limit(request,actor){await enforceDurableRateLimit({request,action:'courier_dispatch',subject:actor.kind==='staff'?actor.employeeId:actor.customerId,limit:120,windowSeconds:900});},
 async read(actor,cursor){
   if(cursor&&!/^[a-f\d-]{36}$/i.test(cursor))throw new CourierError('COURIER_INVALID_COMMAND');
   try{const rows=await courierDb()`SELECT courier_dispatch_queue(${JSON.stringify(actor)}::jsonb,${cursor||null}::uuid) AS result`;return rows[0].result;}catch(e){safe(e);}
 },
 async mutate(actor,command){
   if(staff||actor.kind!=='owner')throw new CourierError('COURIER_FORBIDDEN',403);
   const authorityError=courierAuthorityError(String(command.action));if(authorityError)throw new CourierError(authorityError,409);
   try{
     const db=courierDb();
     const rows=command.action==='assign'
       ?await db`SELECT courier_dispatch_assign(${actor.customerId},${command.id}::uuid,${command.driverId}::uuid,${command.expectedVersion}::integer) AS result`
       :await db`SELECT courier_dispatch_respond(${actor.customerId},${command.id}::uuid,${command.action},${command.expectedVersion}::integer,${command.idempotencyKey}::uuid,${command.reason||null}) AS result`;
     return {result:rows[0].result};
   }catch(e){safe(e);}
 },
},staff,{authorizeStaff:actor=>actor.kind==='staff'&&actor.permissions.couriers_pickup===true,validate:input=>{try{return validateDispatchCommand(input);}catch{throw new CourierError('COURIER_INVALID_COMMAND');}}});}
