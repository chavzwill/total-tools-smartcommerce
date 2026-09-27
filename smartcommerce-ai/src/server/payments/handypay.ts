import {createHmac,timingSafeEqual} from 'node:crypto';

export type PaymentOrder={id:string;amountMinor:number;currency:string;checkoutQuoteId?:string};
type Config={apiKey:string;mode:'test'|'live';publicOrigin:string;checkoutOrigins:string[]};
const sessionId=/^cs_[A-Za-z0-9_]{1,240}$/;
function validOrder(order:PaymentOrder){
  if(!/^[A-Za-z0-9_-]{1,160}$/.test(order.id)||!Number.isSafeInteger(order.amountMinor)||order.amountMinor<=0||!/^[A-Z]{3}$/.test(order.currency))throw new Error('PAYMENT_INVALID_ORDER');
}
export function createHandyPay(config:Config,transport:typeof fetch=fetch){
  let origin:string;
  try{
    const parsed=new URL(config.publicOrigin);origin=parsed.origin;
    if(parsed.protocol!=='https:'||parsed.username||parsed.password||!config.apiKey.startsWith(config.mode==='live'?'hp_live_':'hp_test_')||!['live','test'].includes(config.mode)||!config.checkoutOrigins.length)throw new Error();
    for(const value of config.checkoutOrigins){const url=new URL(value);if(url.protocol!=='https:'||url.origin!==value)throw new Error();}
  }catch{throw new Error('PAYMENT_CONFIGURATION');}
  async function request(path:string,body?:unknown):Promise<Record<string,any>>{
    try{
      const response=await transport('https://api.handypay.me/api/v1'+path,{
        method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(8000),
        headers:{Authorization:`Bearer ${config.apiKey}`,Accept:'application/json','Content-Type':'application/json'},
        ...(body?{body:JSON.stringify(body)}:{}),
      });
      // Never expose upstream bodies, request metadata or credentials to customers.
      if(!response.ok)throw new Error();
      const reader=response.body?.getReader();if(!reader)throw new Error();
      const chunks:Uint8Array[]=[];let size=0;
      for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>65536){await reader.cancel();throw new Error();}chunks.push(part.value);}
      const parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(parsed.success!==true||!parsed.data||typeof parsed.data!=='object'||Array.isArray(parsed.data))throw new Error();
      return parsed.data;
    }catch{throw new Error(body?'PAYMENT_RECONCILIATION_REQUIRED':'PAYMENT_PROVIDER_UNAVAILABLE');}
  }
  return {
    async create(order:PaymentOrder){
      validOrder(order);
      const data=await request('/payment-sessions',{
        line_items:[{amount:order.amountMinor,currency:order.currency.toLowerCase(),name:`Order ${order.id}`,quantity:1}],
        metadata:{order_id:order.id},pass_fees_to_customer:false,
        success_url:`${origin}/#/checkout?paymentQuote=${encodeURIComponent(order.checkoutQuoteId||order.id)}`,cancel_url:`${origin}/#/checkout?paymentQuote=${encodeURIComponent(order.checkoutQuoteId||order.id)}`,
      });
      try{
        const url=new URL(data.url);
        if(!sessionId.test(data.id)||url.protocol!=='https:'||url.username||url.password||!config.checkoutOrigins.includes(url.origin))throw new Error();
        return {id:String(data.id),url:url.href};
      }catch{throw new Error('PAYMENT_RECONCILIATION_REQUIRED');}
    },
    async verify(id:string,order:PaymentOrder):Promise<{status:'paid'|'pending'|'needs_review';sessionId:string}>{
      validOrder(order);if(!sessionId.test(id))throw new Error('PAYMENT_INVALID_SESSION');
      const data=await request('/payment-sessions/'+encodeURIComponent(id));
      if(data.id!==id||data.metadata?.order_id!==order.id||data.amount_total!==order.amountMinor||data.currency!==order.currency.toLowerCase())return {status:'needs_review',sessionId:id};
      return {status:data.status==='complete'&&data.payment_status==='paid'?'paid':'pending',sessionId:id};
    },
  };
}

export function verifyHandyPayEvent(raw:Buffer,signature:string,secret:string):{id:string;type:string;data:Record<string,unknown>}{
  if(!secret||raw.length>1024*1024||!/^sha256=[a-f0-9]{64}$/i.test(signature))throw new Error('PAYMENT_INVALID_SIGNATURE');
  const expected=createHmac('sha256',secret).update(raw).digest();
  if(!timingSafeEqual(expected,Buffer.from(signature.slice(7),'hex')))throw new Error('PAYMENT_INVALID_SIGNATURE');
  let event;try{event=JSON.parse(raw.toString('utf8'));}catch{throw new Error('PAYMENT_INVALID_EVENT');}
  if(!event||typeof event.id!=='string'||event.id.length>255||!event.id||typeof event.type!=='string'||event.type.length>100||!event.data||typeof event.data!=='object'||Array.isArray(event.data))throw new Error('PAYMENT_INVALID_EVENT');
  return {id:event.id,type:event.type,data:event.data};
}
