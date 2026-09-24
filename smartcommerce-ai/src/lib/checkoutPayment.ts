export type CheckoutPaymentState={status:string;available?:boolean;url?:string;amountMinor?:number;currency?:string;dispatch?:{status?:string}|null};
export async function checkoutPayment(quoteId:string,start=false,signal?:AbortSignal):Promise<CheckoutPaymentState>{
 const response=await fetch('/api/checkout-payment'+(start?'':'?quoteId='+encodeURIComponent(quoteId)),{
   method:start?'POST':'GET',credentials:'same-origin',signal,headers:{Accept:'application/json','Content-Type':'application/json'},...(start?{body:JSON.stringify({quoteId})}:{}),
 });
 if(!response.ok)throw new Error('Payment is unavailable. Check your order status before trying again.');
 const data=await response.json();
 if(!data||!['unavailable','ready','creating','awaiting_payment','paid','needs_review'].includes(data.status))throw new Error('Payment status is unavailable.');
 if(data.url){const url=new URL(data.url);if(url.protocol!=='https:'||url.username||url.password)throw new Error('Payment link is unavailable.');}
 return data;
}
