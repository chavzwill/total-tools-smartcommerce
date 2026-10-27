import {neon} from '@neondatabase/serverless';
import {createMobileSessionService} from './sessionService.js';
let client:ReturnType<typeof neon>|undefined;
export function nativeSessionService(){
 return createMobileSessionService({query:async(sql,params)=>{
  if(!client){const url=process.env.SMARTCOMMERCE_DATABASE_URL||process.env.DATABASE_URL;if(!url)throw Error('DATABASE_UNAVAILABLE');client=neon(url);}
  return await client.query(sql,params) as any[];
 }});
}
export async function nativeActor(req:any){
 if(process.env.SMARTCOMMERCE_MOBILE_AUTH_ENABLED!=='true')return null;
 const audience=req.headers?.['x-smartcommerce-app'];if(audience!=='customer'&&audience!=='courier')return null;
 const token=String(req.headers?.authorization||'').match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
 return token?nativeSessionService().actor(token,audience):null;
}
