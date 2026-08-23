import { ArrowRightLeft, ClipboardList, PackageCheck, RefreshCw, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { operationsRequest, type OperationsApiError } from "../../lib/staffOperations";
import "../../styles/supply-chain-board.css";

type Row = Record<string, any>;
type State = { loading: boolean; purchaseRequests: Row[]; purchaseOrders: Row[]; transfers: Row[]; error?: string };
const empty: State = { loading: true, purchaseRequests: [], purchaseOrders: [], transfers: [] };
const label = (value: unknown) => String(value || "—").replace(/_/g," ").replace(/\b\w/g,(m)=>m.toUpperCase());

export default function SupplyChainBoard() {
  const [state, setState] = useState<State>(empty);
  const [tab, setTab] = useState<"requests"|"orders"|"transfers">("requests");
  async function load(){
    setState((current)=>({...current,loading:true,error:undefined}));
    try{
      const [purchaseRequests,purchaseOrders,transfers]=await Promise.all([
        operationsRequest<Row[]>("purchase-requests?limit=150"),
        operationsRequest<Row[]>("purchase-orders?limit=150"),
        operationsRequest<Row[]>("transfers?limit=150"),
      ]);
      setState({loading:false,purchaseRequests:Array.isArray(purchaseRequests)?purchaseRequests:[],purchaseOrders:Array.isArray(purchaseOrders)?purchaseOrders:[],transfers:Array.isArray(transfers)?transfers:[]});
    }catch(error){setState((current)=>({...current,loading:false,error:(error as OperationsApiError).message||"Supply-chain data could not be loaded."}));}
  }
  useEffect(()=>{void load();},[]);
  const pendingPR=useMemo(()=>state.purchaseRequests.filter((row)=>["draft","submitted"].includes(String(row.status))).length,[state.purchaseRequests]);
  const openPO=useMemo(()=>state.purchaseOrders.filter((row)=>!["received","cancelled","closed"].includes(String(row.status))).length,[state.purchaseOrders]);
  const inTransit=useMemo(()=>state.transfers.filter((row)=>String(row.status)==="in_transit").length,[state.transfers]);
  const rows=tab==="requests"?state.purchaseRequests:tab==="orders"?state.purchaseOrders:state.transfers;
  return <section className="sc-supply-chain" data-guide-id="supply-chain-board">
    <div className="sc-supply-chain__metrics">
      <article><ClipboardList size={18}/><span>Pending requests</span><strong>{pendingPR}</strong><small>Draft or submitted</small></article>
      <article><PackageCheck size={18}/><span>Open purchase orders</span><strong>{openPO}</strong><small>Awaiting completion</small></article>
      <article><Truck size={18}/><span>Transfers in transit</span><strong>{inTransit}</strong><small>Between branches</small></article>
      <article><ArrowRightLeft size={18}/><span>Transfer records</span><strong>{state.transfers.length}</strong><small>Live POS history</small></article>
    </div>
    <div className="sc-supply-chain__toolbar"><div>{(["requests","orders","transfers"] as const).map((key)=><button key={key} className={tab===key?"is-active":""} onClick={()=>setTab(key)}>{key==="requests"?"Purchase requests":key==="orders"?"Purchase orders":"Branch transfers"}</button>)}</div><button className="sc-supply-chain__refresh" onClick={()=>void load()} disabled={state.loading}><RefreshCw size={15}/>{state.loading?"Refreshing…":"Refresh"}</button></div>
    {state.error?<div className="sc-ops-empty is-error"><strong>Supply-chain data unavailable</strong><p>{state.error}</p></div>:null}
    {!state.error && !rows.length && !state.loading?<div className="sc-ops-empty"><strong>No {tab.replace(/s$/,'')} records</strong><p>The board only shows records returned by the connected POS.</p></div>:null}
    {rows.length?<div className="sc-supply-chain__list">{rows.map((row,index)=><article key={String(row.id??index)}>
      <div><span>{tab==="requests"?(row.pr_number||`PR ${row.id}`):tab==="orders"?(row.po_number||`PO ${row.id}`):(row.transfer_number||`Transfer ${row.id}`)}</span><strong>{tab==="transfers"?`${row.from_branch_name||"Source"} → ${row.to_branch_name||"Destination"}`:(row.supplier_name||row.department||row.branch_name||"Total Tools")}</strong><small>{tab==="transfers"?(row.item_summary||"Inventory transfer"):(row.notes||row.request_type||"Purchasing record")}</small></div>
      <div><em className={`is-${String(row.status||"unknown")}`}>{label(row.status)}</em><small>{row.created_at||row.expected_date||row.required_date||""}</small></div>
    </article>)}</div>:null}
  </section>;
}
