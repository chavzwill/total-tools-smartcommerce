import type {MobileMfaProof,createMobileSessionService} from './sessionService.js';
type Audience='customer'|'courier';
type Deps={enabled:()=>boolean;limit:(request:any,subject:string)=>Promise<void>;login:(email:string,password:string,code?:string)=>Promise<{accountId:string;mfaRequired:boolean;credentialStamp?:string;mfaProof?:MobileMfaProof}|null>;sessions:ReturnType<typeof createMobileSessionService>};
const credential=(value:unknown)=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);
export function createMobileAuthHandler(deps:Deps){return async(req:any,res:any)=>{
 res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 const send=(status:number,data:unknown)=>{res.statusCode=status;res.end(JSON.stringify(data));};
 const error=(status:number,code:string)=>send(status,{error:{code,message:status===401?'Please sign in again.':status===403?'Additional verification is required.':'The request could not be completed.',retryable:status===429||status===503}});
 try{
  if(!deps.enabled())return error(503,'MOBILE_AUTH_UNAVAILABLE');
  const audience=req.headers?.['x-smartcommerce-app'] as Audience;
  if(audience!=='customer'&&audience!=='courier')return error(400,'INVALID_AUDIENCE');
  const path=new URL(req.url,'https://local.invalid').pathname.replace(/^\/api\/mobile\/v1/,'');
  const method=String(req.method||'GET').toUpperCase();
  if(path==='/auth/me'&&method==='GET'){
   const token=String(req.headers?.authorization||'').match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
   const actor=token?await deps.sessions.actor(token,audience):null;
   return actor?send(200,{account:actor.account,audience:actor.audience}):error(401,'SIGN_IN_REQUIRED');
  }
  if(!['/auth/login','/auth/refresh','/auth/logout','/auth/logout-all'].includes(path))return error(404,'NOT_FOUND');
  if(method!=='POST'){res.setHeader('Allow','POST');return error(405,'METHOD_NOT_ALLOWED');}
  if(!String(req.headers?.['content-type']||'').startsWith('application/json'))return error(400,'INVALID_CONTENT_TYPE');
  await deps.limit(req,'mobile_auth_ip');
  const chunks:Buffer[]=[];let length=0;
  for await(const chunk of req){const b=Buffer.from(chunk);length+=b.length;if(length>16_000)return error(413,'REQUEST_TOO_LARGE');chunks.push(b);}
  const body=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');
  if(!body||Array.isArray(body)||typeof body!=='object'||(body.audience!==undefined&&body.audience!==audience))return error(400,'INVALID_REQUEST');
  if(path==='/auth/login'){
   const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||typeof body.password!=='string'||!body.password||body.password.length>128||typeof body.deviceId!=='string'||!body.deviceId.trim()||body.deviceId.length>200)return error(400,'INVALID_REQUEST');
   await deps.limit(req,email);
   const account=await deps.login(email,body.password,typeof body.code==='string'?body.code:undefined);if(!account)return error(401,'INVALID_CREDENTIALS');
   // MFA proof is created by the trusted verifier, never taken from the body.
   if(account.mfaRequired&&!account.mfaProof)return error(403,'MFA_REQUIRED');
   return send(200,await deps.sessions.issue(account.accountId,audience,body.deviceId,account.credentialStamp,account.mfaProof));
  }
  if(path==='/auth/logout-all'){
   const token=String(req.headers?.authorization||'').match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
   const actor=token?await deps.sessions.actor(token,audience):null;if(!actor)return error(401,'SIGN_IN_REQUIRED');
   await deps.sessions.logoutAll(actor.account.id);return send(200,{ok:true});
  }
  if(!credential(body.refreshToken))return error(400,'INVALID_REQUEST');
  if(path==='/auth/logout'){await deps.sessions.logout(body.refreshToken,audience);return send(200,{ok:true});}
  const session=await deps.sessions.refresh(body.refreshToken,audience);
  return session?send(200,session):error(401,'SIGN_IN_REQUIRED');
 }catch(e){if(e instanceof SyntaxError)return error(400,'INVALID_JSON');return error(Number((e as any)?.status)===429?429:503,'MOBILE_AUTH_UNAVAILABLE');}
};}
