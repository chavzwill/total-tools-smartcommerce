import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import ts from 'typescript';
const source=await readFile(new URL('../src/lib/checkoutPayment.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {checkoutPayment}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
let sent;globalThis.fetch=async(url,options)=>{sent={url,options};return new Response(JSON.stringify({status:'awaiting_payment',url:'https://checkout.stripe.com/pay'}));};
assert.equal((await checkoutPayment('qte_test',true)).status,'awaiting_payment');assert.deepEqual(JSON.parse(sent.options.body),{quoteId:'qte_test'});
globalThis.fetch=async()=>new Response(JSON.stringify({status:'awaiting_payment',url:'javascript:alert(1)'}));await assert.rejects(()=>checkoutPayment('qte_test',true));
globalThis.fetch=async()=>new Response(JSON.stringify({error:{message:'secret database trace'}}),{status:500});await assert.rejects(()=>checkoutPayment('qte_test'),e=>!e.message.includes('secret'));
console.log('Checkout client sends quote identifiers only and rejects unsafe redirects and upstream errors.');
