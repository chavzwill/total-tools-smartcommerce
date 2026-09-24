type Dependencies={enabled:()=>boolean;origin:string;customer:(req:any)=>Promise<string|null>;limit:(req:any,customer:string)=>Promise<void>;read:(customer:string,quote:string)=>Promise<unknown>;start:(customer:string,quote:string)=>Promise<unknown>};
export function paymentHandler(deps:Dependencies){return async(req:any,res:any)=>{
 const send=(status:number,value:unknown)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(value));};
 const fail=(status:number)=>send(status,{error:{code:'PAYMENT_UNAVAILABLE',message:status===401?'Sign in to continue checkout.':'Payment could not be started. Check the order status before trying again.'}});
 try{
   if(!deps.enabled())return fail(503);
   if(!['GET','POST'].includes(req.method))return fail(405);
   const customer=await deps.customer(req);if(!customer)return fail(401);
   await deps.limit(req,customer);
   let quote:string;
   if(req.method==='POST'){
     if(!deps.origin||req.headers?.origin!==deps.origin)return fail(403);
     if(!String(req.headers?.['content-type']).startsWith('application/json'))return fail(400);
     const chunks:Buffer[]=[];let size=0;for await(const chunk of req){const b=Buffer.from(chunk);size+=b.length;if(size>4096)return fail(413);chunks.push(b);}
     let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return fail(400);}
     if(!body||typeof body!=='object'||Object.keys(body).length!==1||typeof body.quoteId!=='string')return fail(400);
     quote=body.quoteId;
   }else quote=new URL(req.url,'http://local').searchParams.get('quoteId')||'';
   if(!/^[A-Za-z0-9_-]{1,160}$/.test(quote))return fail(400);
   return send(200,await (req.method==='POST'?deps.start(customer,quote):deps.read(customer,quote)));
 }catch{return fail(503);}
};}
