import {describe, it, expect} from 'vitest';
import {createApiClient} from '../packages/core/src/transport';

const decode = (value: unknown) => {
  if (!value || typeof value !== 'object' || !('name' in value) || typeof value.name !== 'string') throw Error('bad shape');
  return {name:value.name};
};
const setup = (fetchImpl:typeof fetch, baseUrl='https://commerce.example') => createApiClient({baseUrl,audience:'customer',getAccessToken:async()=> 'private-token',fetchImpl});

describe('mobile transport boundaries',()=>{
  it('preserves encoded search terms',async()=>{
    let url=''; const client=setup(async(input)=>{url=String(input);return Response.json({name:'match'});});
    await client.request('/catalogue?query=MS%20362%20%26%20C',{},decode);
    expect(new URL(url).searchParams.get('query')).toBe('MS 362 & C');
  });
  it('rejects insecure production origins and origins carrying credentials or paths',()=>{
    for(const url of ['http://commerce.example','https://user:secret@commerce.example','https://commerce.example/path','https://commerce.example?x=1']) expect(()=>setup(fetch,url)).toThrow();
  });
  it('rejects arbitrary paths before sending credentials',async()=>{
    const client=setup(async()=>{throw Error('Network must not run');});
    for(const path of ['https://other.example/auth/me','//other.example','/staff-session','/auth/../staff-session','/auth/%2e%2e/staff-session']) await expect(client.request(path,{},decode)).rejects.toMatchObject({code:'INVALID_PATH'});
  });
  it('sends a native audience token only to the configured API with redirects disabled',async()=>{
    let sent: {url:string;init?:RequestInit}|undefined;
    const client=setup(async(url,init)=>{sent={url:String(url),init};return Response.json({name:'Chavez'});});
    expect(await client.request('/auth/me',{},decode)).toEqual({name:'Chavez'});
    expect(sent?.url).toBe('https://commerce.example/api/mobile/v1/auth/me');
    expect(new Headers(sent?.init?.headers).get('Authorization')).toBe('Bearer private-token');
    expect(sent?.init?.redirect).toBe('error');
    expect(sent?.init?.credentials).toBe('omit');
  });
  it('does not trust redirects from transports which ignore redirect:error',async()=>{
    const response=Response.json({name:'secret'});Object.defineProperty(response,'redirected',{value:true});
    await expect(setup(async()=>response).request('/auth/me',{},decode)).rejects.toMatchObject({code:'UNEXPECTED_REDIRECT'});
  });
  it('sanitizes malformed JSON, shape and server errors without leaking raw details',async()=>{
    for(const response of [new Response('<private db error>'),Response.json({password:'secret'})]) await expect(setup(async()=>response).request('/auth/me',{},decode)).rejects.toMatchObject({code:'INVALID_RESPONSE',message:'The service returned an invalid response.'});
    await expect(setup(async()=>Response.json({error:{code:'DATABASE_PASSWORD',message:'secret'}},{status:503})).request('/auth/me',{},decode)).rejects.toMatchObject({code:'SERVICE_UNAVAILABLE',status:503,retryable:true});
  });
  it('keeps cancellation distinguishable from retryable network failure',async()=>{
    const controller=new AbortController();controller.abort();
    await expect(setup(async(_url,init)=>{init?.signal?.throwIfAborted();throw Error('offline');}).request('/auth/me',{signal:controller.signal},decode)).rejects.toMatchObject({name:'AbortError'});
    await expect(setup(async()=>{throw Error('private network information');}).request('/auth/me',{},decode)).rejects.toMatchObject({code:'NETWORK_UNAVAILABLE',retryable:true});
  });
});
