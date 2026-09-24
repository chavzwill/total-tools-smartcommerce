import {verifyHandyPayEvent,createHandyPay} from '../src/server/payments/handypay.js';
import {paymentConfig,paymentsEnabled} from '../src/server/payments/runtime.js';
import {paymentRepository} from '../src/server/payments/repository.js';
import {processPaymentEvent} from '../src/server/payments/workflow.js';
export const config={api:{bodyParser:false}};
export default async function handler(req:any,res:any){
 const send=(status:number)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({received:status===200}));};
 try{
   if(!paymentsEnabled())return send(503);
   if(req.method!=='POST')return send(405);
   const chunks:Buffer[]=[];let size=0;
   for await(const chunk of req){const bytes=Buffer.from(chunk);size+=bytes.length;if(size>1024*1024)return send(413);chunks.push(bytes);}
   const event=verifyHandyPayEvent(Buffer.concat(chunks),String(req.headers?.['x-handypay-signature']||''),process.env.HANDYPAY_WEBHOOK_SECRET||'');
   const configuration=paymentConfig();
   await processPaymentEvent(paymentRepository(configuration.mode),createHandyPay(configuration),event);
   return send(200);
 }catch(error){return send((error as Error).message==='PAYMENT_INVALID_SIGNATURE'?401:503);}
}
