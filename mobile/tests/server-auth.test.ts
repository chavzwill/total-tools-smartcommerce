import {it,expect} from 'vitest';
import {Readable} from 'node:stream';
import {createMobileAuthHandler} from '../../smartcommerce-ai/src/server/mobile/authHandler';
async function request(path:string,body:unknown,headers:Record<string,string>={},enabled=true,mfaRequired=true){
 const issued:unknown[]=[];let limited=false;
 const handler=createMobileAuthHandler({enabled:()=>enabled,limit:async()=>{limited=true;},login:async(email,password)=>email==='one@example.com'&&password==='valid-password'?{accountId:'one',mfaRequired}:null,sessions:{issue:async(...args)=>{issued.push(args);return {accessToken:'a'.repeat(43),refreshToken:'b'.repeat(43),accessExpiresAt:'2030-01-01T00:00:00Z',refreshExpiresAt:'2030-02-01T00:00:00Z',account:{id:'one',fullName:'Chavez'},audience:'customer' as const};},refresh:async()=>null,logout:async()=>{},logoutAll:async()=>{},actor:async()=>null}});
 const req=Object.assign(Readable.from(body===undefined?[]:[JSON.stringify(body)]),{method:body===undefined?'GET':'POST',url:'/api/mobile/v1'+path,headers:{'x-smartcommerce-app':'customer','content-type':'application/json',...headers}});
 let status=0,result:any;const res={statusCode:200,setHeader:()=>{},end(value:string){status=this.statusCode;result=JSON.parse(value);}};
 await handler(req,res);return {status,result,issued,limited};
}
it('fails closed until native authentication is enabled',async()=>{expect((await request('/auth/me',undefined,{},false)).status).toBe(503);});
it('does not treat a browser cookie as native authentication',async()=>{expect((await request('/auth/me',undefined,{cookie:'sc_session=browser'})).status).toBe(401);});
it('rejects mismatched audience declarations',async()=>{expect((await request('/auth/login',{audience:'courier',email:'one@example.com',password:'valid-password',deviceId:'phone'})).status).toBe(400);});
it('requires MFA without issuing a session when account has a factor',async()=>{const r=await request('/auth/login',{audience:'customer',email:'one@example.com',password:'valid-password',deviceId:'phone'});expect(r.status).toBe(403);expect(r.result.error.code).toBe('MFA_REQUIRED');expect(r.issued).toEqual([]);expect(r.limited).toBe(true);});
it('rejects invalid passwords without issuing a session',async()=>{const r=await request('/auth/login',{audience:'customer',email:'one@example.com',password:'wrong',deviceId:'phone'});expect(r.status).toBe(401);expect(r.issued).toEqual([]);});
it('expired refresh credentials fail with a sanitized error',async()=>{const r=await request('/auth/refresh',{audience:'customer',refreshToken:'a'.repeat(43)});expect(r.status).toBe(401);expect(r.result.error.code).toBe('SIGN_IN_REQUIRED');});
it('issues native credentials only after a valid password without pending MFA',async()=>{const r=await request('/auth/login',{audience:'customer',email:'one@example.com',password:'valid-password',deviceId:'phone'},{},true,false);expect(r.status).toBe(200);expect(r.result.account.id).toBe('one');expect(r.issued).toEqual([['one','customer','phone',undefined]]);});
