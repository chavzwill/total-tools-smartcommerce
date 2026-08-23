import { CheckCircle2, ClipboardList, RefreshCw, Send, ShieldCheck, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { getStaffSession, operationsRequest, type OperationsApiError, type StaffIdentity } from "../../lib/staffOperations";
import "../../styles/purchase-request-review.css";

type Row = Record<string, any>;
const n=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0;
const pretty=(v:unknown)=>String(v||"—").replace(/_/g," ").replace(/\b\w/g,m=>m.toUpperCase());
const money=(v:unknown)=>new Intl.NumberFormat("en-JM",{style:"currency",currency:"JMD",maximumFractionDigits:2}).format(n(v));
function can(staff:StaffIdentity|null,key:string,parent:string){if(!staff)return false;if(Object.prototype.hasOwnProperty.call(staff.permissions,key))return staff.permissions[key]===true;return staff.permissions[parent]===true;}

export default function PurchaseRequestReviewPanel(){
  const [staff,setStaff]=useState<StaffIdentity|null>(null);
  const [rows,setRows]=useState<Row[]>([]);
  const [selected,setSelected]=useState<Row|null>(null);
  const [supplierId,setSupplierId]=useState("");
  const [expectedDate,setExpectedDate]=useState("");
  const [rejectionReason,setRejectionReason]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const canCreate=can(staff,"pr_create","purchase_requests");
  const canApprove=can(staff,"pr_approve","purchase_requests");
  const canConvert=can(staff,"pr_convert","purchase_requests");
  async function load(selectId?:string){setLoading(true);setError("");try{const [list,session]=await Promise.all([operationsRequest<Row[]>("purchase-requests?limit=200"),getStaffSession()]);const data=Array.isArray(list)?list:[];setRows(data);setStaff(session.staff);const id=selectId||String(selected?.id||"");if(id){const found=data.find(r=>String(r.id)===id);if(found)await open(found);}}catch(e){setError((e as OperationsApiError).message||"Purchase requests could not be loaded.");}finally{setLoading(false);}}
  async function open(row:Row){setError("");setNotice("");setRejectionReason("");try{const detail=await operationsRequest<Row>(`purchase-requests/${encodeURIComponent(String(row.id))}`);setSelected(detail);setSupplierId(String(detail.supplier_id||""));setExpectedDate(detail.required_date?String(detail.required_date).slice(0,10):"");}catch(e){setError((e as OperationsApiError).message||"Purchase request could not be loaded.");}}
  useEffect(()=>{void load();},[]);
  async function status(next:"submitted"|"approved"|"rejected"|"draft"){if(!selected||busy)return;setBusy(next);setError("");setNotice("");try{await operationsRequest(`purchase-requests/${encodeURIComponent(String(selected.id))}/status`,{method:"PATCH",body:JSON.stringify({status:next,approved_by:next==="approved"?staff?.employeeId:null,rejection_reason:next==="rejected"?rejectionReason||null:null})});setNotice(`${selected.pr_number||"Purchase request"} marked ${pretty(next).toLowerCase()}.`);await load(String(selected.id));}catch(e){setError((e as OperationsApiError).message||"Purchase-request status could not be changed.");}finally{setBusy("");}}
  async function convert(){if(!selected||busy||!supplierId)return;setBusy("convert");setError("");setNotice("");try{const po=await operationsRequest<Row>(`purchase-requests/${encodeURIComponent(String(selected.id))}/convert`,{method:"POST",body:JSON.stringify({supplier_id:supplierId,expected_date:expectedDate||null,notes:`Converted from ${selected.pr_number||`PR ${selected.id}`}`})});setNotice(`${selected.pr_number||"Purchase request"} converted to ${po.po_number||"a new purchase order"}.`);await load(String(selected.id));}catch(e){setError((e as OperationsApiError).message||"Purchase request could not be converted.");}finally{setBusy("");}}
  const items=Array.isArray(selected?.items)?selected!.items:[];
  return <section className="sc-pr-review" data-guide-id="purchase-request-review">
    <div className="sc-pr-review__head"><div><ClipboardList size={19}/><div><strong>Purchase Request Review</strong><span>Submit, approve/reject, and convert approved requests into real purchase orders.</span></div></div><button onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/>{loading?"Refreshing…":"Refresh"}</button></div>
    {error?<div className="sc-ops-empty is-error"><strong>Purchase request action failed</strong><p>{error}</p></div>:null}{notice?<div className="sc-pr-review__notice"><CheckCircle2 size={16}/>{notice}</div>:null}
    <div className="sc-pr-review__layout"><aside>{rows.map(row=><button key={String(row.id)} className={String(selected?.id)===String(row.id)?"is-active":""} onClick={()=>void open(row)}><div><strong>{row.pr_number||`PR ${row.id}`}</strong><span>{row.branch_name||row.department||"Total Tools"}</span></div><em className={`is-${String(row.status||"unknown")}`}>{pretty(row.status)}</em></button>)}</aside><div className="sc-pr-review__detail">{!selected?<div className="sc-ops-empty"><strong>Select a purchase request</strong><p>Choose a request to review its items and workflow state.</p></div>:<>
      <header><div><span>{selected.pr_number||`PR ${selected.id}`}</span><strong>{selected.department||selected.branch_name||"Purchase request"}</strong><small>{pretty(selected.request_type)} · Required {selected.required_date?String(selected.required_date).slice(0,10):"not set"}</small></div><em className={`is-${String(selected.status)}`}>{pretty(selected.status)}</em></header>
      <div className="sc-pr-review__lines">{items.map((item:Row)=><div key={String(item.id)}><div><strong>{item.product_name||item.sku}</strong><span>{item.sku||"Off-catalog item"}{item.product_url?" · sourced online":""}</span></div><div><small>Quantity</small><strong>{n(item.quantity)}</strong></div><div><small>Unit cost</small><strong>{money(item.unit_cost)}</strong></div><div><small>Total</small><strong>{money(item.total)}</strong></div></div>)}</div>
      <div className="sc-pr-review__actions">{selected.status==="draft"?<button onClick={()=>void status("submitted")} disabled={!canCreate||Boolean(busy)}><Send size={15}/>Submit for approval</button>:null}{selected.status==="submitted"?<><button onClick={()=>void status("approved")} disabled={!canApprove||Boolean(busy)}><ShieldCheck size={15}/>Approve</button><label><span>Rejection reason</span><input value={rejectionReason} onChange={e=>setRejectionReason(e.target.value)} placeholder="Required when rejecting"/></label><button className="is-danger" onClick={()=>void status("rejected")} disabled={!canApprove||!rejectionReason.trim()||Boolean(busy)}><XCircle size={15}/>Reject</button></>:null}{selected.status==="rejected"?<button onClick={()=>void status("draft")} disabled={!canCreate||Boolean(busy)}>Return to draft</button>:null}</div>
      {selected.status==="approved"?<div className="sc-pr-review__convert"><label><span>Supplier ID</span><input value={supplierId} onChange={e=>setSupplierId(e.target.value)} placeholder="Supplier ID"/></label><label><span>Expected date</span><input type="date" value={expectedDate} onChange={e=>setExpectedDate(e.target.value)}/></label><button className="sc-button sc-button--primary" onClick={()=>void convert()} disabled={!canConvert||!supplierId||Boolean(busy)}>{busy==="convert"?"Converting…":"Convert to PO"}</button></div>:null}
      {selected.status==="converted"?<div className="sc-pr-review__converted"><CheckCircle2 size={17}/><span>Converted to {selected.converted_po_number||"purchase order"}.</span></div>:null}
      <p className="sc-pr-review__policy">Approval preserves the request as a stable record. Conversion creates a new PO and links it back to this request; receiving the final PO later advances the originating request to received.</p>
    </>}</div></div>
  </section>;
}
