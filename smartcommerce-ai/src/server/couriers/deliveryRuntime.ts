import {createHash} from 'node:crypto';
import {createCourierHandler} from './http.js';
import {courierActor} from './runtime.js';
import {courierDb} from './repository.js';
import {parseCookie} from '../staffSession.js';
import {readDeliveries,mutateDelivery,type DeliveryAudience} from './deliveryRepository.js';
import {validateDeliveryCommand} from './deliveryValidation.js';
import {enforceDurableRateLimit} from '../securityInfrastructure.js';
export function deliveryHandler(audience:DeliveryAudience){return createCourierHandler({
  enabled:()=>process.env.SMARTCOMMERCE_COURIERS_ENABLED==='true',
  actor:async(request,staff)=>{
    if(audience!=='customer')return courierActor(request,staff);
    const token=parseCookie(request.headers?.cookie).sc_session;if(!token)return null;
    const hash=createHash('sha256').update(token).digest('hex');
    const rows=await courierDb()`SELECT s.customer_id FROM customer_sessions s JOIN customer_accounts c ON c.id=s.customer_id WHERE s.token_hash=${hash} AND s.revoked_at IS NULL AND s.expires_at>now() LIMIT 1`;
    return rows[0]?{kind:'owner',customerId:String(rows[0].customer_id)}:null;
  },
  read:(actor,cursor)=>readDeliveries(actor,audience,cursor),
  mutate:(actor,command)=>mutateDelivery(actor,audience,command),
  limit:async(request,actor)=>{await enforceDurableRateLimit({request,action:'courier_delivery_'+audience,subject:actor.kind==='staff'?actor.employeeId:actor.customerId,limit:120,windowSeconds:900});},
},audience==='staff',{validate:validateDeliveryCommand,bodyLimit:3*1024*1024,authorizeStaff:actor=>actor.kind==='staff'&&actor.permissions.couriers_pickup===true});}
