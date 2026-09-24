import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Readable} from 'node:stream';
import ts from 'typescript';
const code=ts.transpileModule(await readFile(new URL('../src/server/couriers/authHttp.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {createCourierAuthHandler}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
let called=0;const handler=createCourierAuthHandler({enabled:()=>true,read:async token=>token==='courier'?{id:'one'}:null,limit:async()=>{},signup:async()=>({id:'one'}),login:async()=>({id:'one'}),session:async()=>{called++;return 'new-courier';},logout:async()=>{}});
async function call(body,headers={},method='POST'){const req=Readable.from([JSON.stringify(body)]);req.method=method;req.headers={host:'localhost:5175',origin:'http://localhost:5175','content-type':'application/json',...headers};const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=JSON.parse(v);}};await handler(req,res);return res;}
assert.equal((await call({}, {cookie:'sc_session=courier'},'GET')).body.authenticated,false);
assert.equal((await call({}, {cookie:'sc_courier_session=courier'},'GET')).body.authenticated,true);
assert.equal((await call({action:'login',email:'a@example.test',password:'longpassword'},{origin:'https://wrong.test'})).statusCode,403);
const logged=await call({action:'login',email:'a@example.test',password:'longpassword'});
assert.equal(logged.statusCode,200);assert.match(logged.headers['Set-Cookie'],/^sc_courier_session=/);assert.match(logged.headers['Set-Cookie'],/HttpOnly/);assert.equal(called,1);
assert.equal((await call({action:'signup',email:'a@example.test',password:'short',fullName:'Test'})).statusCode,400);
console.log('Dedicated courier cookies, origin checks, signup validation and session issuance passed.');
