import {courierDb} from '../couriers/repository.js';
import type {PaymentRepository} from './workflow.js';
export function paymentRepository(mode:'live'|'test'):PaymentRepository{return {
 async claim(customer,quote){
   const db=courierDb();
   const matches=await db`SELECT id FROM smartcommerce_payment_orders WHERE customer_id=${customer} AND checkout_quote_id=${quote} AND provider_mode=${mode}`;
   if(!matches.length)throw new Error('PAYMENT_NOT_FOUND');
   const rows=await db`SELECT smartcommerce_payment_claim(${customer},${quote}) AS result`;const result=rows[0].result;
   if(result.claimed)result.order.checkoutQuoteId=quote;return result;
 },
 async saveSession(id,session){
   const rows=await courierDb()`UPDATE smartcommerce_payment_orders SET status='awaiting_payment',session_id=${session.id},checkout_url=${session.url} WHERE id=${id} AND provider_mode=${mode} AND status='creating' RETURNING id`;
   if(!rows.length)throw new Error('PAYMENT_STATE_CONFLICT');
   return {status:'awaiting_payment',url:session.url};
 },
 async markReview(id){await courierDb()`UPDATE smartcommerce_payment_orders SET status='needs_review' WHERE id=${id} AND provider_mode=${mode} AND status='creating'`;},
 async findSession(id){
   const rows=await courierDb()`SELECT id,amount_minor,currency FROM smartcommerce_payment_orders WHERE session_id=${id} AND provider_mode=${mode}`;
   return rows[0]?{id:rows[0].id,amountMinor:Number(rows[0].amount_minor),currency:rows[0].currency}:null;
 },
 async recordEvent(event){await courierDb()`SELECT smartcommerce_payment_event(${JSON.stringify(event)}::jsonb)`;},
 async settle(order,event){const rows=await courierDb()`SELECT smartcommerce_payment_settle(${order.id},${JSON.stringify(event)}::jsonb) AS result`;return rows[0].result;},
 async reviewEvent(event){await courierDb()`UPDATE smartcommerce_payment_events SET status='needs_review' WHERE id=${event.id} AND status<>'processed'`;},
};}
