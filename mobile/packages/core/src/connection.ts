import type {AppAudience} from './contracts';
import {createApiClient} from './transport';
import {createSessionManager,decodeSession,type SecureSessionStore} from './session';

export function createMobileConnection({baseUrl,audience,store,fetchImpl,clearPrivateData}:{baseUrl:string;audience:AppAudience;store:SecureSessionStore;fetchImpl?:typeof fetch;clearPrivateData?:()=>Promise<void>}){
 let session:ReturnType<typeof createSessionManager>;
 const publicApi=createApiClient({baseUrl,audience,getAccessToken:async()=>null,fetchImpl});
 session=createSessionManager({audience,store,clearPrivateData,api:{
  login:input=>publicApi.request('/auth/login',{method:'POST',anonymous:true,body:{...input,audience}},decodeSession),
  refresh:refreshToken=>publicApi.request('/auth/refresh',{method:'POST',anonymous:true,body:{refreshToken,audience}},decodeSession),
  logout:credential=>publicApi.request('/auth/logout',{method:'POST',anonymous:true,body:{...credential,audience}},value=>{
   if(!value||typeof value!=='object'||!('ok' in value)||value.ok!==true)throw Error('Invalid logout acknowledgment');
  })
 }});
 return {session,api:createApiClient({baseUrl,audience,getAccessToken:()=>session.getAccessToken(),fetchImpl})};
}
