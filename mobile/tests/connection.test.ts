import {it,expect} from 'vitest';
import {createMobileConnection} from '../packages/core/src/connection';
const session={accessToken:'a'.repeat(43),refreshToken:'r'.repeat(43),accessExpiresAt:'2099-01-01T00:00:00Z',refreshExpiresAt:'2099-02-01T00:00:00Z',account:{id:'one',fullName:'Chavez'},audience:'customer'};
const store=()=>{const data=new Map<string,string>();return {get:async(k:string)=>data.get(k)||null,set:async(k:string,v:string)=>{data.set(k,v);},remove:async(k:string)=>{data.delete(k);}};};
it('connects login, authorized reads and logout without leaking bearer credentials into public auth',async()=>{
 const requests:Array<{url:string;headers:Headers;body:any}>=[];
 const connection=createMobileConnection({baseUrl:'https://commerce.example',audience:'customer',store:store(),fetchImpl:async(url,init)=>{
  requests.push({url:String(url),headers:new Headers(init?.headers),body:init?.body?JSON.parse(String(init.body)):null});
  return Response.json(String(url).endsWith('/auth/login')?session:String(url).endsWith('/auth/logout')?{ok:true}:{name:'result'});
 }});
 await connection.session.login({email:'a@example.com',password:'password',deviceId:'phone'});
 await connection.api.request('/orders',{},value=>value);
 await connection.session.logout();
 expect(requests[0].headers.has('Authorization')).toBe(false);expect(requests[0].body.audience).toBe('customer');
 expect(requests[1].headers.get('Authorization')).toBe('Bearer '+'a'.repeat(43));
 expect(requests[2].headers.has('Authorization')).toBe(false);expect(requests[2].body).toEqual({refreshToken:'r'.repeat(43),audience:'customer'});
});
it('restores through anonymous refresh before authorized requests',async()=>{
 const storage=store();await storage.set('smartcommerce.customer.session',JSON.stringify({...session,accessExpiresAt:'1970-01-01T00:00:00Z'}));
 const paths:string[]=[];
 const connection=createMobileConnection({baseUrl:'https://commerce.example',audience:'customer',store:storage,fetchImpl:async(url,init)=>{
  paths.push(new URL(String(url)).pathname);expect(new Headers(init?.headers).has('Authorization')).toBe(!String(url).endsWith('/auth/refresh'));
  return Response.json(String(url).endsWith('/auth/refresh')?session:{name:'result'});
 }});
 await connection.session.restore();await connection.api.request('/orders',{},value=>value);
 expect(paths).toEqual(['/api/mobile/v1/auth/refresh','/api/mobile/v1/orders']);
});
it('preserves only the allowlisted MFA challenge code, without trusting server error text',async()=>{
 const connection=createMobileConnection({baseUrl:'https://commerce.example',audience:'customer',store:store(),fetchImpl:async()=>Response.json({error:{code:'MFA_REQUIRED',message:'private server detail'}},{status:403})});
 await expect(connection.session.login({email:'a@example.com',password:'password',deviceId:'phone'})).rejects.toMatchObject({code:'MFA_REQUIRED',message:'Additional verification is required.'});
 expect(await connection.session.getAccessToken()).toBeNull();
});
