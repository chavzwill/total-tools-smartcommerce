import {randomBytes} from 'node:crypto';
import {createAccount,authenticate} from './account.js';
import {createCourierAuthHandler} from '../src/server/couriers/authHttp.js';
import {courierDb} from '../src/server/couriers/repository.js';
import {credentialHash} from '../src/server/couriers/privateData.js';
import {enforceDurableRateLimit,requestIp} from '../src/server/securityInfrastructure.js';
export default createCourierAuthHandler({
  enabled:()=>process.env.SMARTCOMMERCE_COURIERS_ENABLED==='true',
  read:async token=>{if(!token)return null;const rows=await courierDb()`SELECT c.id,c.full_name AS "fullName",c.email FROM courier_sessions s JOIN customer_accounts c ON c.id::text=s.account_id WHERE s.token_hash=${credentialHash(token)} AND s.revoked_at IS NULL AND s.expires_at>now() AND s.credential_stamp=encode(sha256(convert_to(c.password_hash,'UTF8')),'hex')`;return rows[0] as {id:string}|undefined||null;},
  limit:async(request,email)=>{await enforceDurableRateLimit({request,action:'courier_auth_ip',subject:requestIp(request),limit:30,windowSeconds:900});if(email)await enforceDurableRateLimit({request,action:'courier_auth_identity',subject:email,limit:10,windowSeconds:900});},
  signup:createAccount,login:authenticate,
  session:async(id,oldToken)=>{const token=randomBytes(32).toString('base64url');await courierDb()`WITH revoke AS (UPDATE courier_sessions SET revoked_at=now() WHERE token_hash=${credentialHash(oldToken)}) INSERT INTO courier_sessions(token_hash,account_id,expires_at,credential_stamp) SELECT ${credentialHash(token)},${id},now()+interval '8 hours',encode(sha256(convert_to(password_hash,'UTF8')),'hex') FROM customer_accounts WHERE id::text=${id}`;return token;},
  logout:async token=>{await courierDb()`UPDATE courier_sessions SET revoked_at=now() WHERE token_hash=${credentialHash(token)}`;},
});
