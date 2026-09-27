import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
async function moduleUrl(path,replacements={}){let code=ts.transpileModule(await readFile(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;for(const [a,b] of Object.entries(replacements))code=code.replaceAll(JSON.stringify(a),JSON.stringify(b)).replaceAll("'"+a+"'",JSON.stringify(b));return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;}
const policy=await moduleUrl('../src/server/couriers/policy.ts');
const {createCourierHandler}=await import(await moduleUrl('../src/server/couriers/http.ts',{'./policy.js':policy}));
let actor={kind:'owner',customerId:'owner'},called=0,enabled=true,failure=false;
const deps={enabled:()=>enabled,actor:async()=>actor,limit:async()=>{},read:async()=>({application:null}),mutate:async()=>{called++;if(failure)throw new Error('password=secret SQL postgres://private');return {status:'submitted'};}};
async function call({body={},headers={},method='POST',staff=false,raw}={}){const req=Readable.from([raw??JSON.stringify(body)]);req.method=method;req.url='/api/couriers';req.headers={origin:'http://localhost:5173',host:'localhost:5173','content-type':'application/json',...headers};const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=JSON.parse(v);}};await createCourierHandler(deps,staff)(req,res);return res;}
const command={action:'submit_application',id:crypto.randomUUID(),expectedVersion:1,idempotencyKey:crypto.randomUUID()};
assert.equal((await call({body:command})).statusCode,200);
actor=null;assert.equal((await call({body:command})).statusCode,401);
actor={kind:'staff',employeeId:'e',permissions:{reports:true}};assert.equal((await call({body:command,staff:true})).statusCode,403);
actor={kind:'owner',customerId:'owner'};
assert.equal((await call({body:{...command,ownerCustomerId:'someone'}})).statusCode,400);
assert.equal((await call({body:command,headers:{origin:'https://attacker.test'}})).statusCode,403);
assert.equal((await call({body:command,headers:{origin:undefined}})).statusCode,403);
assert.equal((await call({raw:'{broken'})).statusCode,400);
assert.equal((await call({raw:'x'.repeat(65537)})).statusCode,413);
assert.equal((await call({method:'DELETE'})).statusCode,405);
assert.equal((await call({body:{...command,action:'approve'}})).statusCode,403);
failure=true;const failed=await call({body:command});assert.equal(failed.statusCode,503);assert.doesNotMatch(JSON.stringify(failed.body),/password|postgres|SQL|secret/);
enabled=false;assert.equal((await call({body:command})).statusCode,503);
assert.equal(called,2);
console.log('Courier API authentication, explicit permissions, origin, body limits and sanitized errors passed.');
const client=await import(await moduleUrl('../src/lib/couriers.ts'));
for(const response of [new Response('<html/>'),Response.json({}),Response.json({error:{message:'private SQL failure'}},{status:503})]){
  globalThis.fetch=async()=>response;
  await assert.rejects(()=>client.getCourierWorkspace(),e=>!e.message.includes('SQL'));
}
globalThis.fetch=async()=>Response.json({application:null,services:[],references:{areas:[],categories:[],collectionPoints:[],currencies:[]},bookingAvailable:false});
assert.equal((await client.getCourierWorkspace()).application,null);
console.log('Courier client rejects malformed or failed responses without leaking server details.');
