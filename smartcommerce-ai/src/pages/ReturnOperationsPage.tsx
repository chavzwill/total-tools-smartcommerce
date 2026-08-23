import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardList, Loader2, LogOut, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import Container from "../components/shared/Container";
import { getStaffSession, loginStaff, logoutStaff, type StaffSessionSummary } from "../services/deliveryReviewClient";
import { listStaffReturns, updateStaffReturn, type ReturnRequest } from "../services/returnsClient";
import "../styles/returns.css";

type ActionOption=[string,string];
const LABELS:Record<string,string>={
 start_review:"Start review",approve:"Approve",reject:"Reject",request_item_return:"Request item return",mark_received:"Mark item received",
 mark_refund_pending:"Refund pending",mark_refund_completed:"Refund completed",mark_exchange_pending:"Exchange pending",mark_exchange_completed:"Exchange completed",
 mark_repair_pending:"Repair pending",mark_repair_completed:"Repair completed",mark_store_credit_pending:"Store credit pending",mark_store_credit_completed:"Store credit completed",close:"Close"
};
function resolutionAction(item:ReturnRequest,phase:"pending"|"completed"){
 const prefix=String(item.requested_resolution||"").replace("store_credit","store_credit");
 return `mark_${prefix}_${phase}`;
}
function availableActions(item:ReturnRequest):ActionOption[]{
 const resolutionPending=resolutionAction(item,"pending"), resolutionCompleted=resolutionAction(item,"completed");
 const byStatus:Record<string,string[]>={
  requested:["start_review","reject"],under_review:["approve","reject"],approved:["request_item_return","mark_received",resolutionPending],
  awaiting_item:["mark_received","reject"],received:[resolutionPending],refund_pending:[resolutionCompleted],exchange_pending:[resolutionCompleted],repair_pending:[resolutionCompleted],store_credit_pending:[resolutionCompleted],
  rejected:["close"],refund_completed:["close"],exchange_completed:["close"],repair_completed:["close"],store_credit_completed:["close"],closed:[]
 };
 return (byStatus[item.status]||[]).map((value)=>[value,LABELS[value]||value]);
}
function money(value:number|null|undefined,currency="JMD"){if(value==null)return "—";return new Intl.NumberFormat("en-JM",{style:"currency",currency}).format(Number(value)/100);}

export default function ReturnOperationsPage(){
 const [staff,setStaff]=useState<StaffSessionSummary|null>(null);const [checking,setChecking]=useState(true);const [username,setUsername]=useState("");const [password,setPassword]=useState("");const [loginError,setLoginError]=useState("");
 const [status,setStatus]=useState("requested");const [returns,setReturns]=useState<ReturnRequest[]>([]);const [loading,setLoading]=useState(false);const [error,setError]=useState("");const [saving,setSaving]=useState("");
 const [drafts,setDrafts]=useState<Record<string,{action:string;approved:string;providerReturnId:string;refundReference:string;staffNotes:string;publicMessage:string}>>({});
 useEffect(()=>{let active=true;getStaffSession().then((r)=>{if(active)setStaff(r.authenticated?r.staff:null);}).catch(()=>{if(active)setStaff(null);}).finally(()=>{if(active)setChecking(false);});return()=>{active=false;};},[]);
 async function refresh(next=status){if(!staff)return;setLoading(true);setError("");try{const result=await listStaffReturns(next);setReturns(result.returns||[]);}catch(err:any){setError(err?.message||"Returns could not be loaded.");}finally{setLoading(false);}}
 useEffect(()=>{if(staff)void refresh(status);},[staff,status]);
 async function signIn(e:React.FormEvent){e.preventDefault();setLoginError("");try{const result=await loginStaff({username:username.trim(),password});setStaff(result.staff);setPassword("");}catch(err:any){setLoginError(err?.message||"Staff sign-in failed.");}}
 async function signOut(){await logoutStaff().catch(()=>undefined);setStaff(null);setReturns([]);}
 function draft(item:ReturnRequest){const actions=availableActions(item);return drafts[item.id]||{action:actions[0]?.[0]||"",approved:item.approved_amount_minor!=null?(Number(item.approved_amount_minor)/100).toFixed(2):"",providerReturnId:item.provider_return_id||"",refundReference:item.refund_reference||"",staffNotes:item.staff_notes||"",publicMessage:""};}
 function patch(item:ReturnRequest,key:string,value:string){setDrafts((current)=>({...current,[item.id]:{...draft(item),...(current[item.id]||{}),[key]:value}}));}
 async function save(item:ReturnRequest){const d=draft(item);if(!d.action){setError("This return has no valid next action. Refresh the queue or review its current status.");return;}setSaving(item.id);setError("");try{const approved=d.approved.trim()?Math.round(Number(d.approved)*100):undefined;if(approved!==undefined&&!Number.isFinite(approved))throw new Error("Enter a valid approved amount.");await updateStaffReturn({id:item.id,action:d.action,approvedAmountMinor:approved,providerReturnId:d.providerReturnId.trim()||undefined,refundReference:d.refundReference.trim()||undefined,staffNotes:d.staffNotes.trim()||undefined,publicMessage:d.publicMessage.trim()||undefined});setDrafts((current)=>{const next={...current};delete next[item.id];return next;});await refresh(status);}catch(err:any){setError(err?.message||"Return could not be updated.");}finally{setSaving("");}}
 if(checking)return <div className="sc-returns-page"><Container><div className="sc-return-empty"><Loader2 className="sc-spin" size={20}/>Checking staff access…</div></Container></div>;
 if(!staff)return <div className="sc-returns-page"><Container className="sc-returns-shell"><section className="sc-return-login"><span className="sc-returns-kicker"><ShieldCheck size={16}/> Internal returns</span><h1>Returns operations</h1><p>Sign in with your Total Tools POS staff credentials. Customer accounts cannot access this workspace.</p><form onSubmit={signIn}><label>Username<input value={username} onChange={(e)=>setUsername(e.target.value)} autoComplete="username" required/></label><label>Password<input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} autoComplete="current-password" required/></label>{loginError?<p className="sc-return-alert is-error">{loginError}</p>:null}<button className="sc-return-submit">Sign in to returns</button></form></section></Container></div>;
 return <div className="sc-returns-page"><Container className="sc-returns-shell">
  <header className="sc-returns-hero"><div><span className="sc-returns-kicker"><ClipboardList size={16}/> Returns operations</span><h1>Review, receive and reconcile every return.</h1><p>Approval is not the same as refund completion. SmartCommerce keeps staff decisions, physical item receipt and provider refund evidence separate.</p></div><button className="sc-return-signout" onClick={()=>void signOut()}><LogOut size={16}/>Sign out</button></header>
  <section className="sc-return-ops-toolbar"><div>{["requested","under_review","approved","awaiting_item","received","refund_pending","exchange_pending","repair_pending","store_credit_pending","all"].map((value)=><button key={value} className={status===value?"is-active":""} onClick={()=>setStatus(value)}>{value.replaceAll("_"," ")}</button>)}</div><button onClick={()=>void refresh()} disabled={loading}><RefreshCw size={16} className={loading?"sc-spin":""}/>Refresh</button></section>
  {error?<p className="sc-return-alert is-error" role="alert">{error}</p>:null}
  {!loading&&!returns.length?<div className="sc-return-empty"><CheckCircle2 size={24}/><strong>No returns in this queue.</strong><span>New customer requests will appear here after order ownership is verified.</span></div>:null}
  <div className="sc-return-ops-list">{returns.map((item)=>{const d=draft(item);const actions=availableActions(item);return <article className="sc-return-op-card" key={item.id}><div className="sc-return-card__top"><div><span>{item.order_id}</span><strong>{item.item_summary||"Order return"}</strong></div><span className={`sc-return-status is-${item.status}`}>{item.status.replaceAll("_"," ")}</span></div><p>{item.customer_notes||"No additional customer notes."}</p><div className="sc-return-card__meta"><span>Requested: {item.requested_resolution.replace("_"," ")}</span><span>Reason: {item.reason.replaceAll("_"," ")}</span><span>Requested amount: {money(item.requested_amount_minor,item.currency)}</span><span>Approved: {money(item.approved_amount_minor,item.currency)}</span></div><div className="sc-return-op-form"><label>Valid next action<select value={d.action} onChange={(e)=>patch(item,"action",e.target.value)} disabled={!actions.length}>{actions.length?actions.map(([value,label])=><option value={value} key={value}>{label}</option>):<option value="">No further action</option>}</select></label><label>Approved amount ({item.currency})<input inputMode="decimal" value={d.approved} onChange={(e)=>patch(item,"approved",e.target.value)} placeholder="0.00"/></label><label>Provider / completion reference<input value={d.providerReturnId} onChange={(e)=>patch(item,"providerReturnId",e.target.value)} placeholder="POS return, exchange, repair or credit reference"/></label><label>Refund reference<input value={d.refundReference} onChange={(e)=>patch(item,"refundReference",e.target.value)} placeholder="Required before refund completed"/></label><label className="is-wide">Customer-facing update<textarea rows={2} value={d.publicMessage} onChange={(e)=>patch(item,"publicMessage",e.target.value)} placeholder="What should the customer see?"/></label><label className="is-wide">Internal notes<textarea rows={3} value={d.staffNotes} onChange={(e)=>patch(item,"staffNotes",e.target.value)} placeholder="Inspection result, packaging, serial, warranty, payment path…"/></label></div><button className="sc-return-submit" onClick={()=>void save(item)} disabled={saving===item.id||!actions.length}>{saving===item.id?<><Loader2 className="sc-spin" size={16}/>Saving…</>:<>Update return <RotateCcw size={16}/></>}</button></article>;})}</div>
 </Container></div>;
}
