import {it,expect} from 'vitest';
import {Readable} from 'node:stream';
import {paymentHandler} from '../../smartcommerce-ai/src/server/payments/http';
async function run(native:boolean,customer:string|null,body:unknown){let status=0,started=0;
 const handler=paymentHandler({native,enabled:()=>true,origin:'https://commerce.example',customer:async()=>customer,limit:async()=>{},read:async()=>({}),start:async()=>{started++;return {status:'awaiting_payment'};}});
 const req=Object.assign(Readable.from([JSON.stringify(body)]),{method:'POST',headers:{'content-type':'application/json'}});
 await handler(req,{statusCode:200,setHeader(){},end(){status=this.statusCode;}});return {status,started};
}
it('allows the native handler to start checkout for its authenticated account without browser origin',async()=>{expect(await run(true,'one',{quoteId:'quote'})).toEqual({status:200,started:1});});
it('retains browser origin protection in the existing handler',async()=>{expect(await run(false,'one',{quoteId:'quote'})).toEqual({status:403,started:0});});
it('rejects unauthenticated native requests and injected totals',async()=>{expect(await run(true,null,{quoteId:'quote'})).toEqual({status:401,started:0});expect(await run(true,'one',{quoteId:'quote',amount:1})).toEqual({status:400,started:0});});
