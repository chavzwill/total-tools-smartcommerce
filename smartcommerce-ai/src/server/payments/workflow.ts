import type {PaymentOrder} from './handypay.js';
type Event={id:string;type:string;data:Record<string,unknown>};
type Provider={create:(order:PaymentOrder)=>Promise<{id:string;url:string}>;verify:(id:string,order:PaymentOrder)=>Promise<{status:string}>};
export type PaymentRepository={
 claim:(customer:string,quote:string)=>Promise<{claimed:boolean;order:PaymentOrder;result:unknown}>;
 saveSession:(id:string,session:{id:string;url:string})=>Promise<unknown>;
 markReview:(id:string)=>Promise<void>;
 findSession:(id:string)=>Promise<PaymentOrder|null>;
 recordEvent:(event:Event)=>Promise<void>;
 settle:(order:PaymentOrder,event:Event)=>Promise<unknown>;
 reviewEvent:(event:Event)=>Promise<void>;
};
export async function startPayment(repo:PaymentRepository,provider:Provider,customer:string,quote:string){
 const claim=await repo.claim(customer,quote);
 if(!claim.claimed)return claim.result;
 try{return await repo.saveSession(claim.order.id,await provider.create(claim.order));}
 catch{
   // No second create after an uncertain response, including a failed database save.
   await repo.markReview(claim.order.id);
   throw new Error('PAYMENT_RECONCILIATION_REQUIRED');
 }
}
export async function processPaymentEvent(repo:PaymentRepository,provider:Provider,event:Event){
 await repo.recordEvent(event);
 if(!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)){
   await repo.reviewEvent(event);return {status:'needs_review'};
 }
 const id=event.data.id;
 if(typeof id!=='string')throw new Error('PAYMENT_INVALID_EVENT');
 const order=await repo.findSession(id);
 // A webhook can arrive before the create response has been saved. Request redelivery.
 if(!order)throw new Error('PAYMENT_SESSION_UNMAPPED');
 const verified=await provider.verify(id,order);
 if(verified.status==='paid')return repo.settle(order,event);
 if(verified.status==='needs_review')await repo.reviewEvent(event);
 return {status:verified.status};
}
