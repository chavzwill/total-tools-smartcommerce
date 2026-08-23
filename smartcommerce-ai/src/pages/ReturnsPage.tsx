import { useEffect, useState } from "react";
import { ArrowRightLeft, CheckCircle2, Loader2, PackageCheck, RefreshCw, RotateCcw } from "lucide-react";
import Container from "../components/shared/Container";
import { createCustomerReturn, listCustomerReturns, type ReturnRequest } from "../services/returnsClient";
import "../styles/returns.css";

const STATUS_LABEL:Record<string,string>={requested:"Request received",under_review:"Under review",approved:"Approved",rejected:"Not approved",awaiting_item:"Awaiting item",received:"Item received",refund_pending:"Refund pending",refund_completed:"Refund completed",exchange_pending:"Exchange pending",exchange_completed:"Exchange completed",repair_pending:"Repair pending",repair_completed:"Repair completed",store_credit_pending:"Store credit pending",store_credit_completed:"Store credit completed",closed:"Closed"};
function money(value:number|null|undefined,currency="JMD"){if(value==null)return "—";return new Intl.NumberFormat("en-JM",{style:"currency",currency}).format(Number(value)/100);}

export default function ReturnsPage(){
 const [returns,setReturns]=useState<ReturnRequest[]>([]);const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);const [error,setError]=useState("");const [success,setSuccess]=useState("");
 const [orderId,setOrderId]=useState("");const [resolution,setResolution]=useState("refund");const [reason,setReason]=useState("defective");const [itemSummary,setItemSummary]=useState("");const [notes,setNotes]=useState("");
 async function refresh(){setLoading(true);setError("");try{const result=await listCustomerReturns();setReturns(result.returns||[]);}catch(err:any){setError(err?.message||"Returns could not be loaded.");}finally{setLoading(false);}}
 useEffect(()=>{void refresh();},[]);
 async function submit(event:React.FormEvent){event.preventDefault();setSaving(true);setError("");setSuccess("");try{const result=await createCustomerReturn({orderId:orderId.trim(),requestedResolution:resolution,reason,itemSummary:itemSummary.trim()||undefined,customerNotes:notes.trim()||undefined});setReturns((current)=>[result.return,...current.filter((item)=>item.id!==result.return.id)]);setSuccess("Your return request has been submitted for review.");setOrderId("");setItemSummary("");setNotes("");}catch(err:any){setError(err?.message||"We could not submit this return request.");}finally{setSaving(false);}}
 return <div className="sc-returns-page"><Container className="sc-returns-shell">
  <header className="sc-returns-hero"><div><span className="sc-returns-kicker"><RotateCcw size={16}/> Returns & exchanges</span><h1>Resolve an order without the runaround.</h1><p>Start a return, exchange, repair assessment or store-credit request. SmartCommerce verifies the order belongs to your account before staff can review it.</p></div><a href="#/account/orders">View my orders</a></header>
  <div className="sc-returns-grid">
   <form className="sc-return-form" onSubmit={submit}><div className="sc-return-form__head"><div><strong>Start a request</strong><span>No refund is issued until staff verifies the order, item and payment path.</span></div><PackageCheck size={22}/></div>
    <label>Order reference<input value={orderId} onChange={(e)=>setOrderId(e.target.value)} placeholder="ord_…" required /></label>
    <div className="sc-return-form__split"><label>What would you prefer?<select value={resolution} onChange={(e)=>setResolution(e.target.value)}><option value="refund">Refund</option><option value="exchange">Exchange</option><option value="repair">Repair assessment</option><option value="store_credit">Store credit</option></select></label><label>Why are you returning it?<select value={reason} onChange={(e)=>setReason(e.target.value)}><option value="defective">Defective</option><option value="damaged">Damaged</option><option value="wrong_item">Wrong item</option><option value="not_as_described">Not as described</option><option value="changed_mind">Changed my mind</option><option value="other">Other</option></select></label></div>
    <label>Item(s) involved<textarea rows={3} value={itemSummary} onChange={(e)=>setItemSummary(e.target.value)} placeholder="Example: 1 × cordless drill, unopened battery pack" /></label>
    <label>Tell us what happened<textarea rows={4} value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder="Include damage, missing parts, incorrect item, symptoms or anything staff should inspect." /></label>
    {error?<p className="sc-return-alert is-error" role="alert">{error}</p>:null}{success?<p className="sc-return-alert is-success" role="status"><CheckCircle2 size={16}/>{success}</p>:null}
    <button className="sc-return-submit" disabled={saving}>{saving?<><Loader2 className="sc-spin" size={16}/>Submitting…</>:<>Submit for review <ArrowRightLeft size={16}/></>}</button>
   </form>
   <section className="sc-return-history"><div className="sc-return-history__head"><div><strong>Your requests</strong><span>Updates appear here as staff reviews and processes them.</span></div><button type="button" onClick={()=>void refresh()} disabled={loading}><RefreshCw className={loading?"sc-spin":""} size={16}/>Refresh</button></div>
    {!loading&&!returns.length?<div className="sc-return-empty"><RotateCcw size={24}/><strong>No return requests yet.</strong><span>When you submit one, its full status will remain visible here.</span></div>:null}
    <div className="sc-return-list">{returns.map((item)=><article key={item.id} className="sc-return-card"><div className="sc-return-card__top"><div><span>{item.order_id}</span><strong>{STATUS_LABEL[item.status]||item.status}</strong></div><span className={`sc-return-status is-${item.status}`}>{item.requested_resolution.replace("_"," ")}</span></div><p>{item.item_summary||item.customer_notes||"Return request submitted for staff review."}</p><div className="sc-return-card__meta"><span>Reason: {item.reason.replaceAll("_"," ")}</span><span>Requested: {money(item.requested_amount_minor,item.currency)}</span><span>Approved: {money(item.approved_amount_minor,item.currency)}</span></div>{item.refund_reference?<small>Refund reference: {item.refund_reference}</small>:null}<footer><span>Request {item.id}</span><time>{new Date(item.updated_at||item.created_at).toLocaleString("en-JM")}</time></footer></article>)}</div>
   </section>
  </div>
 </Container></div>;
}
