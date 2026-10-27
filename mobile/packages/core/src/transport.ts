import {ApiError,type AppAudience,type Decoder} from './contracts';

type Options={baseUrl:string;audience:AppAudience;getAccessToken:()=>Promise<string|null>;fetchImpl?:typeof fetch};
type RequestOptions={method?:'GET'|'POST'|'PATCH'|'DELETE';body?:unknown;signal?:AbortSignal;anonymous?:boolean};
const routes=/^\/(?:auth|catalogue|products|parts|cart|quotes|checkout|orders|driver|devices|assistant|rentals|repairs|commercial)(?:[/?]|$)/;

export function createApiClient({baseUrl,audience,getAccessToken,fetchImpl=fetch}:Options){
  const origin=new URL(baseUrl);
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash) throw new Error('A secure API origin is required.');
  return {
    async request<T>(path:string,options:RequestOptions,decode:Decoder<T>):Promise<T>{
      const pathname=path.split('?')[0];
      if(!routes.test(path)||/[\\#\u0000-\u0020]/.test(path)||pathname.includes('%')||pathname.split('/').some(segment=>segment==='..'||segment==='.')||pathname.includes('//')) throw new ApiError('INVALID_PATH',0,'This API path is not permitted.');
      const destination=new URL(`/api/mobile/v1${path}`,origin);
      options.signal?.throwIfAborted();
      const token=options.anonymous?null:await getAccessToken();
      const headers:Record<string,string>={Accept:'application/json','X-Smartcommerce-App':audience};
      if(token)headers.Authorization=`Bearer ${token}`;
      if(options.body!==undefined)headers['Content-Type']='application/json';
      let response:Response;
      try{
        response=await fetchImpl(destination.toString(),{method:options.method||'GET',signal:options.signal,redirect:'error',credentials:'omit',headers,...(options.body===undefined?{}:{body:JSON.stringify(options.body)})});
      }catch(error){
        if(options.signal?.aborted||(error instanceof Error&&error.name==='AbortError'))throw error;
        throw new ApiError('NETWORK_UNAVAILABLE',0,'Unable to connect. Check your connection and try again.',true);
      }
      if(response.redirected||(response.status>=300&&response.status<400))throw new ApiError('UNEXPECTED_REDIRECT',response.status,'The service returned an unexpected redirect.');
      if(!response.ok){
        if(response.status===403){
          const data=await response.json().catch(()=>null);
          if(data?.error?.code==='MFA_REQUIRED')throw new ApiError('MFA_REQUIRED',403,'Additional verification is required.');
        }
        const code=response.status===401?'SIGN_IN_REQUIRED':response.status===403?'FORBIDDEN':response.status===409?'STATE_CONFLICT':response.status===429?'RATE_LIMITED':response.status>=500?'SERVICE_UNAVAILABLE':'REQUEST_REJECTED';
        throw new ApiError(code,response.status,response.status===401?'Please sign in again.':response.status===409?'This information changed. Refresh and try again.':'The request could not be completed.',response.status===429||response.status>=500);
      }
      try{return decode(await response.json());}catch{throw new ApiError('INVALID_RESPONSE',response.status,'The service returned an invalid response.');}
    }
  };
}
