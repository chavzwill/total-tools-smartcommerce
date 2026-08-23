import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Clock3, Loader2, PackageCheck, RefreshCw, RotateCcw, Truck } from "lucide-react";
import Container from "../components/shared/Container";
import { listCustomerOrders, type CustomerOrderSummary } from "../services/customerOrdersClient";
import "../styles/customer-orders.css";

function money(minor:number,currency="JMD"){return new Intl.NumberFormat("en-JM",{style:"currency",currency}).format(Number(minor||0)/100);}
function title(value:string){return String(value||"").replaceAll("_"," ").replace(/\b\w/g,(letter)=>letter.toUpperCase());}
function orderAction(order:CustomerOrderSummary){
 if(order.returnRequest)return {href:"#/account/returns",label:"View return"};
 if(order.fulfilment?.status)return {href:`#/track-order?ref=${encodeURIComponent(order.id)}`,label:"Track fulfilment"};
 return {href:"#/account/returns",label:"Request help"};
}

export default function CustomerOrdersPage({embedded=false}:{embedded?:boolean}){
 const [orders,setOrders]=useState<CustomerOrderSummary[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState("");
 async function refresh(){setLoading(true);setError("");try{const result=await listCustomerOrders();setOrders(result.orders||[]);}catch(err:any){setError(err?.message||"Your orders could not be loaded.");}finally{setLoading(false);}}
 useEffect(()=>{void refresh();},[]);
 const active=useMemo(()=>orders.filter((order)=>!["delivered","collected"].includes(order.fulfilment?.status||"")).length,[orders]);
 const content=<>
  <header className="sc-orders-hero"><div><span className="sc-orders-kicker"><PackageCheck size={16}/> My orders</span><h1>{embedded?"Your purchases":"Everything after checkout, in one place."}</h1><p>Track fulfilment, pickup, delivery exceptions, commercial terms and return activity from the authoritative SmartCommerce order record.</p></div><div className="sc-orders-hero__stats"><strong>{orders.length}</strong><span>orders</span><strong>{active}</strong><span>active</span></div></header>
  <section className="sc-orders-toolbar"><div>{!embedded?<a href="#/account">Account overview</a>:null}<a href="#/account/returns">Returns & exchanges</a></div><button type="button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={16} className={loading?"sc-spin":""}/>Refresh</button></section>
  {error?<p className="sc-orders-alert" role="alert">{error}</p>:null}
  {loading?<div className="sc-orders-empty"><Loader2 className="sc-spin" size={24}/><strong>Loading your verified orders…</strong></div>:null}
  {!loading&&!orders.length?<div className="sc-orders-empty"><PackageCheck size={28}/><strong>No completed SmartCommerce orders yet.</strong><span>Provider-accepted orders will appear here automatically after checkout.</span><a href="#/products">Browse products</a></div>:null}
  <div className="sc-orders-list">{orders.map((order)=>{const action=orderAction(order);const fulfilment=order.fulfilment||{status:"order_received",mode:"pickup"};return <article className="sc-order-card" key={order.id}>
   <div className="sc-order-card__head"><div><span>{new Date(order.orderedAt).toLocaleString("en-JM")}</span><strong>{order.reference}</strong><small>{order.purchaseOrderReference?`PO ${order.purchaseOrderReference}`:order.description||"SmartCommerce order"}</small></div><div className="sc-order-card__amount"><strong>{money(order.totalMinor,order.currency)}</strong><span>{order.sourceCoverage==="provider_synced"?"Provider synced":"SmartCommerce recorded"}</span></div></div>
   <div className="sc-order-progress"><div className={`sc-order-progress__icon is-${fulfilment.status}`}>{fulfilment.status==="exception"?<AlertTriangle size={19}/>:fulfilment.mode==="pickup"?<PackageCheck size={19}/>:<Truck size={19}/>}</div><div><span>{title(fulfilment.status||"order_received")}</span><strong>{fulfilment.mode==="pickup"?"Pickup":fulfilment.serviceLabel||fulfilment.provider||"Delivery"}</strong>{fulfilment.collectionPointName?<small>Collect at {fulfilment.collectionPointName}</small>:null}{fulfilment.scheduledFor?<small><Clock3 size={12}/> {new Date(fulfilment.scheduledFor).toLocaleString("en-JM")}</small>:null}{fulfilment.exceptionMessage?<small className="is-exception">{fulfilment.exceptionMessage}</small>:null}</div></div>
   <div className="sc-order-card__facts"><span>Delivery <strong>{order.deliveryMinor?money(order.deliveryMinor,order.currency):fulfilment.mode==="pickup"?"Pickup":"Included / pending"}</strong></span>{order.paymentTermsCode?<span>Terms <strong>{order.paymentTermsCode}</strong></span>:null}{order.returnRequest?<span>Return <strong>{title(order.returnRequest.status)}</strong></span>:null}</div>
   {order.returnRequest?<div className="sc-order-return"><RotateCcw size={17}/><div><strong>{title(order.returnRequest.resolution)} request</strong><span>{title(order.returnRequest.status)}{order.returnRequest.approvedAmountMinor!=null?` · ${money(order.returnRequest.approvedAmountMinor,order.currency)} approved`:""}</span>{order.returnRequest.refundReference?<small>Refund ref: {order.returnRequest.refundReference}</small>:null}</div></div>:null}
   <footer><span>{order.id}</span><a href={action.href}>{action.label}<ArrowRight size={15}/></a></footer>
  </article>;})}</div>
 </>;
 if(embedded)return <div className="sc-orders-page is-embedded"><div className="sc-orders-shell">{content}</div></div>;
 return <div className="sc-orders-page"><Container className="sc-orders-shell">{content}</Container></div>;
}
