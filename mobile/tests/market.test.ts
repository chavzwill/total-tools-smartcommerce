import {it,expect} from 'vitest';
import {Readable} from 'node:stream';
import {createMobileMarketHandler,publicCatalogueRequest} from '../../smartcommerce-ai/src/server/mobile/marketHandler';
import {handlePlatformRestRequest} from '../../smartcommerce-ai/src/backend/platformRestApi';
async function run(path:string,actor:any=null){let body:any,status=0;const calls:string[]=[];
 const handler=createMobileMarketHandler({enabled:()=>true,limit:async()=>{},actor:async()=>actor,publicRead:async request=>{calls.push(request.url);expect(request.headers.get('x-actor-id')).toBeNull();return Response.json({success:true,data:{items:[{id:'p',name:'Saw',active:true,pricing:[{currency:'JMD',listPrice:200,commercialPrice:1}],metadata:{secret:'private'}}]}});},cart:async()=>{},driver:async account=>({account}),application:async()=>({})});
 await handler({url:'/api/mobile/v1'+path,method:'GET',headers:{'x-smartcommerce-app':'customer','x-actor-id':'attacker'}},{statusCode:200,setHeader(){},end(text:string){status=this.statusCode;body=JSON.parse(text);}});
 return {body,status,calls};
}
it('exposes a bounded catalogue projection without internal metadata or negotiated prices',async()=>{const r=await run('/catalogue?query=saw&branchId=kingston');expect(r.status).toBe(200);expect(r.body.items[0]).toMatchObject({id:'p',name:'Saw'});expect(JSON.stringify(r.body)).not.toContain('commercialPrice');expect(JSON.stringify(r.body)).not.toContain('secret');expect(r.calls[0]).toContain('branchId=kingston');});
it('requires native identity before a persistent cart can be accessed',async()=>{expect((await run('/cart')).status).toBe(401);});
it('does not treat customer identity as a courier identity',async()=>{expect((await run('/driver/jobs',{account:{id:'one'},audience:'customer'})).status).toBe(403);});
it('rejects excessive search input before querying providers',async()=>{const r=await run('/catalogue?query='+'a'.repeat(501));expect(r.status).toBe(400);expect(r.calls).toEqual([]);});
it('supplies trusted tenant context to the actual platform router',async()=>{
 const req=publicCatalogueRequest(new Request('https://internal.invalid/api/platform/products',{headers:{'x-business-account-id':'attacker','authorization':'private'}}),{businessAccountId:'business',providerId:'pos'});
 const service={searchProducts:async(request:Request)=>({success:request.headers.get('x-business-account-id')==='business'&&request.headers.get('x-provider-id')==='pos',data:{items:[]}})};
 const response=await handlePlatformRestRequest(req,service as any);
 expect((await response.json()).success).toBe(true);expect(req.headers.has('authorization')).toBe(false);
});
it('preserves definitive application validation rejection instead of reporting an ambiguous outage',async()=>{
 let status=0,payload:any;const handler=createMobileMarketHandler({enabled:()=>true,limit:async()=>{},actor:async()=>({account:{id:'one'},audience:'courier'}),publicRead:async()=>Response.json({}),cart:async()=>{},driver:async()=>({}),application:async()=>{throw {status:400,code:'COURIER_INVALID_EMAIL'};}});
 const req=Object.assign(Readable.from(['{}']),{url:'/api/mobile/v1/driver/application',method:'POST',headers:{'content-type':'application/json'}});
 await handler(req,{statusCode:200,setHeader(){},end(s:string){status=this.statusCode;payload=JSON.parse(s);}});
 expect(status).toBe(400);expect(payload.error.code).toBe('INVALID_APPLICATION');
});
