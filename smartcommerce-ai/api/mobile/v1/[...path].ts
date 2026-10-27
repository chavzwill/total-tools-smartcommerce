import {nativeCheckoutPayment} from '../../../src/server/payments/runtime.js';
import cartHandler from '../../commerce.js';
import {createMobileMarketHandler,publicCatalogueRequest} from '../../../src/server/mobile/marketHandler.js';
import {nativeActor} from '../../../src/server/mobile/nativeIdentity.js';
import {handlePlatformRestRequest} from '../../../src/backend/platformRestApi.js';
import {createConfiguredTotalToolsPlatformService} from '../../../src/integrations/totalToolsPlatformRuntime.js';
import {mutateCourier} from '../../../src/server/couriers/repository.js';
import {neon} from '@neondatabase/serverless';
import {decryptSecret,matchMobileTotpCounter} from '../../account-mfa.js';
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
const authHandler=createMobileAuthHandler({
 enabled:()=>process.env.SMARTCOMMERCE_MOBILE_AUTH_ENABLED==='true',
 sessions,
 limit:async(request,subject)=>{await enforceDurableRateLimit({request,action:subject==='mobile_auth_ip'?'mobile_auth_ip':'mobile_auth_identity',subject:subject==='mobile_auth_ip'?requestIp(request):subject,limit:subject==='mobile_auth_ip'?40:10,windowSeconds:900});},
 login:async(email,password,code)=>{
  const rows=await db().query(`SELECT c.id,c.password_hash,EXISTS(SELECT 1 FROM customer_authenticators a WHERE a.customer_id=c.id AND a.status='active' AND a.revoked_at IS NULL) AS mfa_required FROM customer_accounts c WHERE c.email=$1`,[email]) as Array<{id:string;password_hash:string;mfa_required:boolean}>;
  const account=await authenticate(email,password);if(!account||!rows[0]||rows[0].id!==account.id)return null;
  let mfaProof;
  if(rows[0].mfa_required&&code&&/^\d{6}$/.test(code)){
   const factors=await db().query("SELECT id,secret_encrypted,mobile_factor_stamp(customer_id) AS stamp FROM customer_authenticators WHERE customer_id=$1 AND authenticator_type='totp' AND status='active' AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1",[account.id]) as Array<{id:string;secret_encrypted:string;stamp:string}>;
   if(factors[0]){const factor=factors[0],counter=matchMobileTotpCounter(decryptSecret(factor.secret_encrypted),code);if(counter!==null)mfaProof={stamp:factor.stamp,factorId:factor.id,encryptedSecret:factor.secret_encrypted,counter};}
  }
  return {accountId:account.id,mfaRequired:Boolean(rows[0].mfa_required),credentialStamp:String(rows[0].password_hash),mfaProof};
 }
});

const platform=createConfiguredTotalToolsPlatformService();
const marketHandler=createMobileMarketHandler({
 enabled:()=>process.env.SMARTCOMMERCE_MOBILE_AUTH_ENABLED==='true',actor:nativeActor,cart:cartHandler,checkout:nativeCheckoutPayment,
 limit:async(request)=>{await enforceDurableRateLimit({request,action:'mobile_market_ip',subject:requestIp(request),limit:120,windowSeconds:900});},
 publicRead:request=>handlePlatformRestRequest(publicCatalogueRequest(request,{businessAccountId:process.env.SMARTCOMMERCE_BUSINESS_ACCOUNT_ID?.trim()||'public-catalog',providerId:process.env.SMARTCOMMERCE_PROVIDER_ID?.trim()||(process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_URL?'total-tools-pos':'public-unsupported')}),platform),
 driver:async(account,path)=>{
  if(path==='/driver/jobs'){
   const jobs=await db().query(`SELECT j.id,j.order_id AS "orderNumber",j.status,j.version FROM courier_dispatch_jobs j JOIN courier_drivers d ON d.id=j.driver_id AND d.organization_id=j.organization_id WHERE d.account_id=$1 AND d.active=true ORDER BY j.created_at DESC LIMIT 50`,[account]);
   return {jobs,verificationPending:true,canUpdate:false};
  }
  const application=await db().query('SELECT id,status,version,decision_reason AS "decisionReason" FROM courier_organizations WHERE owner_customer_id::text=$1 LIMIT 1',[account]) as any[];
  const drivers=await db().query('SELECT id,organization_id AS \"organizationId\",active FROM courier_drivers WHERE account_id=$1 LIMIT 1',[account]) as any[];
  return {application:application[0]||null,driver:drivers[0]||null,verificationPending:true,canUpdate:false};
 },
 application:async(account,body:any)=>{
  if(!body||!['create_application','save_application','submit_application'].includes(body.action))throw Error('INVALID_APPLICATION_ACTION');
  // This actor owns only this account's application; no driver job privileges are granted.
  return mutateCourier({kind:'owner',customerId:account},{action:body.action,input:body.input,id:body.id,expectedVersion:body.expectedVersion,idempotencyKey:body.idempotencyKey});
 }
});
export default async function handler(req:any,res:any){
 const path=new URL(req.url,'https://local.invalid').pathname;
 return path.startsWith('/api/mobile/v1/auth/')?authHandler(req,res):marketHandler(req,res);
}

export const config={api:{bodyParser:false}};
