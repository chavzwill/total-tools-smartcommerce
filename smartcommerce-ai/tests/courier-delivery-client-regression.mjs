import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const dataUrl=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
async function moduleUrl(path,replacements={}){let code=ts.transpileModule(await readFile(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;for(const[a,b]of Object.entries(replacements))code=code.replaceAll(JSON.stringify(a),JSON.stringify(b)).replaceAll("'"+a+"'",JSON.stringify(b));return dataUrl(code);}
const errors=await moduleUrl('../src/lib/couriers.ts');
const {deliveryRequest}=await import(await moduleUrl('../src/lib/courierDelivery.ts',{'./couriers':errors}));
let requested;
globalThis.fetch=async(url,options)=>{requested={url,options};return Response.json({deliveries:[],nextCursor:null,checkedAt:'2026-09-18T00:00:00Z'});};
assert.deepEqual((await deliveryRequest('customer')).deliveries,[]);assert.equal(requested.url,'/api/customer-deliveries');assert.equal(requested.options.credentials,'same-origin');
for(const response of [new Response('<html/>'),Response.json({deliveries:[{}]}),Response.json({error:{message:'SQL private detail'}},{status:503})]){globalThis.fetch=async()=>response;await assert.rejects(()=>deliveryRequest('customer'),e=>!e.message.includes('SQL'));}
const valid={id:crypto.randomUUID(),orderNumber:'ORDER-1',status:'delivered',version:3,updatedAt:null,canUpdate:false,canConfirm:true,receiptStatus:null,receiptReason:null,receiptAt:null,hasProof:true,items:[],destination:{},events:[]};
globalThis.fetch=async()=>Response.json({deliveries:[valid],nextCursor:null,checkedAt:'2026-09-18T00:00:00Z'});
assert.equal((await deliveryRequest('customer')).deliveries[0].canConfirm,true);
globalThis.fetch=async()=>Response.json({deliveries:[{...valid,receiptStatus:'paid'}],nextCursor:null,checkedAt:'2026-09-18T00:00:00Z'});
await assert.rejects(()=>deliveryRequest('customer'));
globalThis.fetch=async()=>Response.json({result:{status:'delivered'}});
assert.equal((await deliveryRequest('courier',{action:'update_status'})).status,'delivered');
console.log('Delivery client uses audience endpoints and rejects malformed or leaking responses.');
