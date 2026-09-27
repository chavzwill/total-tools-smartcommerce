import {courierAuthorityError} from './authority.js';
import {CourierError} from './policy.js';
import {createCourierHandler} from './http.js';
import {courierActor} from './runtime.js';
import {readCourierPrivate,mutateCourierPrivate,validatePrivateCommand} from './privateRepository.js';
import {enforceDurableRateLimit} from '../securityInfrastructure.js';
export function courierPrivateHandler(staff=false){return createCourierHandler({enabled:()=>process.env.SMARTCOMMERCE_COURIERS_ENABLED==='true',actor:courierActor,read:readCourierPrivate,mutate:(actor,command)=>{const code=courierAuthorityError(String(command.action));if(code)throw new CourierError(code,409);return mutateCourierPrivate(actor,command);},limit:async(request,actor)=>{await enforceDurableRateLimit({request,action:'courier_private',subject:actor.kind==='owner'?actor.customerId:actor.employeeId,limit:60,windowSeconds:900});}},staff,{validate:validatePrivateCommand,bodyLimit:3*1024*1024,authorizeStaff:actor=>actor.kind==='staff'&&['couriers_verify','couriers_payments','couriers_pickup'].some(p=>actor.permissions[p]===true)});}
