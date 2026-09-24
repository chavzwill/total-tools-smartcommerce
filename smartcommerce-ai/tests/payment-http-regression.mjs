import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {Readable} from 'node:stream';import ts from 'typescript';
const source=await readFile(new URL('../src/server/payments/http.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {paymentHandler}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
let starts=0;const deps={enabled:()=>true,origin:'https://shop.example',customer:async()=> 'customer',limit:async()=>{},read:async()=>({available:true,status:'ready'}),start:async()=>{starts++;return {status:'awaiting_payment'};}};
async function send(overrides={},body={quoteId:'quote-test'},dependencies=deps){const req=Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]),{method:'POST',url:'/api/checkout-payment',headers:{origin:'https://shop.example','content-type':'application/json'},...overrides});let value;const res={statusCode:0,setHeader(){},end(v){value=JSON.parse(v);}};await paymentHandler(dependencies)(req,res);return {status:res.statusCode,value};}
assert.equal((await send()).status,200);assert.equal(starts,1);
assert.equal((await send({headers:{origin:'https://evil.example','content-type':'application/json'}})).status,403);
assert.equal((await send({}, {quoteId:'quote-test',amountMinor:1})).status,400);
assert.equal((await send({},undefined,{...deps,customer:async()=>null})).status,401);
assert.equal((await send({},undefined,{...deps,enabled:()=>false})).status,503);
const err=await send({},undefined,{...deps,start:async()=>{throw new Error('database password secret');}});assert.equal(err.status,503);assert.ok(!JSON.stringify(err).includes('secret'));
assert.equal(starts,1);console.log('Payment HTTP authentication, origin, amount injection and error sanitization passed.');
