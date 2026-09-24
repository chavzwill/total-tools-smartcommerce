import {createHash} from 'node:crypto';
import {courierAuthorityError} from './authority.js';
import {CourierError} from './policy.js';
import {parseCookie,readStaffSession,STAFF_COOKIE_NAME} from '../staffSession.js';
import {enforceDurableRateLimit} from '../securityInfrastructure.js';
import {createCourierHandler} from './http.js';
import {courierDb,readCourierWorkspace,mutateCourier} from './repository.js';
import type {CourierActor} from '../../types/courier.js';
export async function courierActor(request:any,isStaff:boolean):Promise<CourierActor|null>{
    const cookies=parseCookie(request.headers?.cookie);
    if(isStaff){const session=readStaffSession(cookies[STAFF_COOKIE_NAME]);if(!session)return null;const branches=await courierDb()`SELECT branch_id FROM courier_staff_branches WHERE employee_id=${session.employeeId}`;return {kind:'staff',employeeId:session.employeeId,branchIds:branches.map(b=>String(b.branch_id)),permissions:session.permissions};}
    const token=cookies.sc_courier_session;if(!token)return null;
    const hash=createHash('sha256').update(token).digest('hex');
    const rows=await courierDb()`SELECT s.account_id FROM courier_sessions s JOIN customer_accounts c ON c.id::text=s.account_id WHERE s.token_hash=${hash} AND s.revoked_at IS NULL AND s.expires_at>now() AND s.credential_stamp=encode(sha256(convert_to(c.password_hash,'UTF8')),'hex') LIMIT 1`;
    return rows[0]?{kind:'owner',customerId:String(rows[0].account_id)}:null;
}
export function courierHandler(staff=false){return createCourierHandler({
  enabled:()=>process.env.SMARTCOMMERCE_COURIERS_ENABLED==='true',
  actor:courierActor,
  limit:async(request,actor)=>{await enforceDurableRateLimit({request,action:'courier_'+request.method,subject:actor.kind==='owner'?actor.customerId:actor.employeeId,limit:request.method==='GET'?120:30,windowSeconds:900});},
  read:readCourierWorkspace,mutate:(actor,command)=>{const code=courierAuthorityError(String(command.action));if(code)throw new CourierError(code,409);return mutateCourier(actor,command);},
},staff);}
