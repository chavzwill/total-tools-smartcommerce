import {neon} from '@neondatabase/serverless';
import {authenticate} from '../../account.js';
import {enforceDurableRateLimit,requestIp} from '../../../src/server/securityInfrastructure.js';
import {createMobileSessionService} from '../../../src/server/mobile/sessionService.js';
import {createMobileAuthHandler} from '../../../src/server/mobile/authHandler.js';
let client:ReturnType<typeof neon>|undefined;
function db(){
 if(!client){const url=process.env.SMARTCOMMERCE_DATABASE_URL||process.env.DATABASE_URL;if(!url)throw Error('DATABASE_UNAVAILABLE');client=neon(url);}
 return client;
}
const sessions=createMobileSessionService({query:async(sql,params)=>await db().query(sql,params) as any[]});
export default createMobileAuthHandler({
 enabled:()=>process.env.SMARTCOMMERCE_MOBILE_AUTH_ENABLED==='true',
 sessions,
 limit:async(request,subject)=>{await enforceDurableRateLimit({request,action:subject==='mobile_auth_ip'?'mobile_auth_ip':'mobile_auth_identity',subject:subject==='mobile_auth_ip'?requestIp(request):subject,limit:subject==='mobile_auth_ip'?40:10,windowSeconds:900});},
 login:async(email,password)=>{
  const rows=await db().query(`SELECT c.id,c.password_hash,EXISTS(SELECT 1 FROM customer_authenticators a WHERE a.customer_id=c.id AND a.status='active' AND a.revoked_at IS NULL) AS mfa_required FROM customer_accounts c WHERE c.email=$1`,[email]) as Array<{id:string;password_hash:string;mfa_required:boolean}>;
  const account=await authenticate(email,password);if(!account||!rows[0]||rows[0].id!==account.id)return null;
  return {accountId:account.id,mfaRequired:Boolean(rows[0].mfa_required),credentialStamp:String(rows[0].password_hash)};
 }
});
