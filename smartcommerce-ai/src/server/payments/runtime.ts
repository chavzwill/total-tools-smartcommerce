import {createHash} from 'node:crypto';
import {createHandyPay} from './handypay.js';
import {courierDb} from '../couriers/repository.js';
import {parseCookie} from '../staffSession.js';
import {enforceDurableRateLimit} from '../securityInfrastructure.js';
import {paymentHandler} from './http.js';
import {paymentRepository} from './repository.js';
import {startPayment} from './workflow.js';
export function paymentConfig():{mode:'live'|'test';apiKey:string;publicOrigin:string;checkoutOrigins:string[]}{
 const mode=process.env.SMARTCOMMERCE_PAYMENT_MODE;
 if((mode!=='live'&&mode!=='test')||!process.env.HANDYPAY_WEBHOOK_SECRET)throw new Error('PAYMENT_CONFIGURATION');
 return {mode,apiKey:process.env.HANDYPAY_API_KEY||'',publicOrigin:process.env.SMARTCOMMERCE_PUBLIC_ORIGIN||'',checkoutOrigins:(process.env.HANDYPAY_CHECKOUT_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean)};
}
export function paymentsEnabled(){return process.env.SMARTCOMMERCE_PAYMENTS_ENABLED==='true'&&process.env.SMARTCOMMERCE_PAYMENT_PROVIDER==='handypay';}
export const checkoutPayment=paymentHandler({
 enabled:paymentsEnabled,origin:process.env.SMARTCOMMERCE_PUBLIC_ORIGIN||'',
 async customer(req){
   const token=parseCookie(req.headers?.cookie).sc_session;if(!token)return null;
   const hash=createHash('sha256').update(token).digest('hex');
   const rows=await courierDb()`SELECT customer_id FROM customer_sessions WHERE token_hash=${hash} AND revoked_at IS NULL AND expires_at>now()`;
   return rows[0]?String(rows[0].customer_id):null;
 },
 async limit(request,customer){await enforceDurableRateLimit({request,action:'checkout_payment',subject:customer,limit:30,windowSeconds:900});},
 async read(customer,quote){
   const config=paymentConfig();createHandyPay(config);
   const rows=await courierDb()`SELECT status,reserved_until,dispatch_result,amount_minor,currency FROM smartcommerce_payment_orders WHERE customer_id=${customer} AND checkout_quote_id=${quote} AND provider_mode=${config.mode}`;
   const order=rows[0];return {available:!!order&&['ready','awaiting_payment'].includes(order.status)&&new Date(order.reserved_until).getTime()>Date.now(),status:order?.status||'unavailable',dispatch:order?.dispatch_result||null,...(order?{amountMinor:Number(order.amount_minor),currency:order.currency}:{})};
 },
 async start(customer,quote){const config=paymentConfig();return startPayment(paymentRepository(config.mode),createHandyPay(config),customer,quote);},
});
