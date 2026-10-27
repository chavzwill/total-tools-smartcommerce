type Actor={account:{id:string};audience:string};
export function publicCatalogueRequest(request:Request,context:{businessAccountId:string;providerId:string}){
 return new Request(request.url,{method:'GET',headers:{'x-business-account-id':context.businessAccountId,'x-provider-id':context.providerId}});
}
type Deps={enabled:()=>boolean;limit:(req:any)=>Promise<void>;actor:(req:any)=>Promise<Actor|null>;publicRead:(request:Request)=>Promise<Response>;cart:(req:any,res:any)=>Promise<any>;checkout?:(req:any,res:any)=>Promise<any>;driver:(account:string,path:string)=>Promise<unknown>;application:(account:string,body:unknown)=>Promise<unknown>};
const safeProduct=(p:any)=>({id:String(p.id),name:String(p.name||''),description:typeof p.description==='string'?p.description:undefined,brand:typeof p.brand==='string'?p.brand:undefined,sku:typeof p.sku==='string'?p.sku:undefined,active:p.active===true,purchasable:p.purchasable===true,images:Array.isArray(p.images)?p.images.filter((i:any)=>typeof i.url==='string'&&i.url.startsWith('https://')).map((i:any)=>({url:i.url,alt:typeof i.alt==='string'?i.alt:''})):[],pricing:Array.isArray(p.pricing)?p.pricing.map((r:any)=>({currency:r.currency,listPrice:Number.isFinite(r.listPrice)?r.listPrice:undefined,salePrice:Number.isFinite(r.salePrice)?r.salePrice:undefined})):[],availability:'unknown'});
export function createMobileMarketHandler(deps:Deps){return async(req:any,res:any)=>{
 res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
 const send=(status:number,value:unknown)=>{res.statusCode=status;res.end(JSON.stringify(value));};
 const fail=(status:number,code:string)=>send(status,{error:{code,message:'This service is currently unavailable.',retryable:status===503}});
 try{
  if(!deps.enabled())return fail(503,'MOBILE_UNAVAILABLE');await deps.limit(req);
  const url=new URL(req.url,'https://local.invalid'),path=url.pathname.replace(/^\/api\/mobile\/v1/,'');
  if(req.method==='GET'&&(path==='/catalogue'||/^\/products\/[A-Za-z0-9_-]+$/.test(path))){
   const query=url.searchParams.get('query')||'',branch=url.searchParams.get('branchId')||'';
   if(query.length>500||branch.length>180)return fail(400,'INVALID_QUERY');
   const target=new URL(path==='/catalogue'?'/api/platform/products':'/api/platform'+path,'https://internal.invalid');
   if(query)target.searchParams.set('search',query);if(branch)target.searchParams.set('branchId',branch);target.searchParams.set('pageSize','30');
   const result=await deps.publicRead(new Request(target));const payload=await result.json();if(!result.ok||!payload.success)return fail(503,'CATALOGUE_UNAVAILABLE');
   return path==='/catalogue'?send(200,{items:(Array.isArray(payload.data?.items)?payload.data.items:[]).filter((p:any)=>p&&p.active===true).map(safeProduct),checkedAt:new Date().toISOString()}):send(200,{product:safeProduct(payload.data),checkedAt:new Date().toISOString()});
  }
  const actor=await deps.actor(req);if(!actor)return fail(401,'SIGN_IN_REQUIRED');
  if(path==='/checkout'){if(actor.audience!=='customer')return fail(403,'FORBIDDEN');return deps.checkout?deps.checkout(req,res):fail(503,'PAYMENT_UNAVAILABLE');}
  if(path==='/cart'){
   if(actor.audience!=='customer')return fail(403,'FORBIDDEN');
   if(!['GET','POST'].includes(req.method))return fail(405,'METHOD_NOT_ALLOWED');
   return deps.cart(req,res);
  }
  if(path.startsWith('/driver/')){
   if(actor.audience!=='courier')return fail(403,'FORBIDDEN');
   if(req.method==='GET'&&['/driver/profile','/driver/jobs'].includes(path))return send(200,await deps.driver(actor.account.id,path));
   if(req.method==='POST'&&path==='/driver/application'){
    if(!String(req.headers?.['content-type']||'').startsWith('application/json'))return fail(400,'INVALID_REQUEST');
    const chunks:Buffer[]=[];let length=0;for await(const chunk of req){const b=Buffer.from(chunk);length+=b.length;if(length>16000)return fail(413,'REQUEST_TOO_LARGE');chunks.push(b);}
    return send(200,await deps.application(actor.account.id,JSON.parse(Buffer.concat(chunks).toString('utf8'))));
   }
   // Driver writes remain under the existing POS verification authority.
   return fail(409,'COURIER_POS_VERIFICATION_PENDING');
  }
  return fail(404,'NOT_FOUND');
 }catch(error){
  const status=Number((error as any)?.status);
  if([400,422].includes(status))return fail(400,'INVALID_APPLICATION');
  if([403,404,409].includes(status))return fail(status,status===409?'STATE_CONFLICT':'REQUEST_REJECTED');
  return fail(error instanceof SyntaxError?400:503,'SERVICE_UNAVAILABLE');
 }
};}
