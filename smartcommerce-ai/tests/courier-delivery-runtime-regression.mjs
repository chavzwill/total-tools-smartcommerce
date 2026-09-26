import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const dataUrl=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
async function moduleUrl(path,replacements={}){let code=ts.transpileModule(await readFile(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;for(const[a,b]of Object.entries(replacements))code=code.replaceAll(JSON.stringify(a),JSON.stringify(b)).replaceAll("'"+a+"'",JSON.stringify(b));return dataUrl(code);}
const policy=await moduleUrl('../src/server/couriers/policy.ts');
const authority=await moduleUrl('../src/server/couriers/authority.ts');
const privateData=await moduleUrl('../src/server/couriers/privateData.ts');
const validation=await moduleUrl('../src/server/couriers/deliveryValidation.ts',{'./policy.js':policy,'./privateData.js':privateData});
const http=await moduleUrl('../src/server/couriers/http.ts',{'./policy.js':policy});
globalThis.deliveryCalls=[];
globalThis.deliveryTestActor={kind:'owner',customerId:'driver'};
globalThis.deliverySessionValid=true;
const repo=dataUrl(`export const readDeliveries=async(actor,audience)=>{globalThis.deliveryCalls.push({actor,audience});return {deliveries:[{id:'legacy-delivery',canUpdate:true}]}};export const mutateDelivery=async(actor,audience,command)=>{globalThis.deliveryCalls.push({actor,audience,command});return {result:{}}};`);
const runtime=await import(await moduleUrl('../src/server/couriers/deliveryRuntime.ts',{
 './http.js':http,'./deliveryValidation.js':validation,'./deliveryRepository.js':repo,
 './authority.js':authority,'./policy.js':policy,
 './runtime.js':dataUrl('export const courierActor=async()=>globalThis.deliveryTestActor;'),
 './repository.js':dataUrl("export const courierDb=()=>async()=>globalThis.deliverySessionValid?[{customer_id:'authenticated-customer'}]:[];"),
 '../staffSession.js':dataUrl("export const parseCookie=value=>Object.fromEntries((value||'').split(';').filter(Boolean).map(p=>p.trim().split('=')));"),
 '../securityInfrastructure.js':dataUrl('export const enforceDurableRateLimit=async()=>{};'),
}));
process.env.SMARTCOMMERCE_COURIERS_ENABLED='true';process.env.SMARTCOMMERCE_PUBLIC_ORIGIN='https://shop.example.test';
async function call(audience,{cookie='sc_session=real-customer-cookie',body,origin='https://shop.example.test'}={}){const req=Readable.from(body?[JSON.stringify(body)]:[]);req.method=body?'POST':'GET';req.url='/api/deliveries?audience=staff';req.headers={cookie,origin,'content-type':'application/json'};const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=JSON.parse(v);}};await runtime.deliveryHandler(audience)(req,res);return res;}
assert.equal((await call('customer')).statusCode,200);assert.deepEqual(globalThis.deliveryCalls.at(-1),{actor:{kind:'owner',customerId:'authenticated-customer'},audience:'customer'});
assert.equal((await call('customer',{cookie:'sc_courier_session=driver-cookie'})).statusCode,401);
globalThis.deliverySessionValid=false;assert.equal((await call('customer')).statusCode,401);globalThis.deliverySessionValid=true;
globalThis.deliveryTestActor={kind:'staff',employeeId:'staff',permissions:{couriers_manage:true},branchIds:['branch']};assert.equal((await call('staff')).statusCode,403);
globalThis.deliveryTestActor.permissions.couriers_pickup=true;assert.equal((await call('staff')).statusCode,200);
globalThis.deliveryTestActor={kind:'owner',customerId:'driver'};
const legacyRead=await call('courier');
assert.equal(legacyRead.body.deliveries[0].canUpdate,false);
const update={action:'update_status',id:crypto.randomUUID(),idempotencyKey:crypto.randomUUID(),expectedVersion:0,status:'in_transit'};
const callsBeforeUpdate=globalThis.deliveryCalls.length;
const blockedUpdate=await call('courier',{body:update});
assert.equal(blockedUpdate.statusCode,409);
assert.equal(blockedUpdate.body.error.code,'COURIER_POS_VERIFICATION_PENDING');
assert.equal(globalThis.deliveryCalls.length,callsBeforeUpdate);
const proof={action:'read_proof',id:crypto.randomUUID(),idempotencyKey:crypto.randomUUID()};
assert.equal((await call('customer',{body:proof,origin:'https://attacker.test'})).statusCode,403);
assert.equal((await call('customer',{body:{...proof,customerId:'other'}})).statusCode,400);
assert.equal((await call('customer',{body:proof})).headers['Cache-Control'],'no-store');
process.env.SMARTCOMMERCE_COURIERS_ENABLED='false';assert.equal((await call('customer')).statusCode,503);
console.log('Delivery endpoints fix audience server-side, separate customer cookies, require pickup permission and protect proof reads against cross-origin requests.');
