import {useEffect,useRef,useState} from 'react';
import {checkoutPayment,type CheckoutPaymentState} from '../../lib/checkoutPayment';
export default function CheckoutPayment({quoteId,returning=false}:{quoteId:string;returning?:boolean}){
 const [state,setState]=useState<CheckoutPaymentState|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const submitting=useRef(false);
 useEffect(()=>{
   let alive=true;const abort=new AbortController();setState(null);setError('');
   const read=async()=>{try{const next=await checkoutPayment(quoteId,false,abort.signal);if(alive){setState(next);setError('');}}catch{if(alive)setError('We cannot confirm payment availability right now.');}};
   void read();const timer=setInterval(()=>{if(document.visibilityState==='visible'&&!submitting.current)void read();},15000);
   return()=>{alive=false;abort.abort();clearInterval(timer);};
 },[quoteId]);
 async function pay(){
   if(submitting.current)return;submitting.current=true;setBusy(true);setError('');
   try{const result=await checkoutPayment(quoteId,true);setState(result);if(result.status==='awaiting_payment'&&result.url)window.location.assign(result.url);}
   catch{setState(null);setError('Payment could not be opened. We will check the saved status before another attempt.');}
   finally{submitting.current=false;setBusy(false);}
 }
 const message=state?.status==='paid'
   ?state.dispatch?.status==='needs_review'?'Payment confirmed. Delivery requires staff review.':state.dispatch?.status==='awaiting_driver'?'Payment confirmed. Your delivery has been sent to the courier.':'Payment confirmed.'
   :state?.status==='needs_review'?'Your payment needs review. Please contact Total Tools before paying again.'
   :state?.status==='creating'?'Your payment session is being prepared. Please wait.'
   :returning?'Payment has not been confirmed yet. This page checks for confirmation automatically.'
   :state?.available?'Continue to HandyPay to pay securely.':'Online payment is not currently available for this order.';
 return <><p role="status">{message}</p>{state?.amountMinor&&state.currency?<p>Payment total: {new Intl.NumberFormat('en-JM',{style:'currency',currency:state.currency}).format(state.amountMinor/100)}</p>:null}{error?<p role="alert">{error}</p>:null}{!returning?<button type="button" disabled={!state?.available||busy} onClick={pay}>{busy?'Opening secure payment…':'Pay securely with HandyPay'}</button>:null}</>;
}
