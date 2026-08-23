import { CheckCircle2, CircleAlert, Clock3, Loader2, MapPin, PackageCheck, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Container from "../components/shared/Container";
import { getCustomerDeliveryTracking, type CustomerTracking, type DeliveryStatus } from "../services/deliveryLifecycleClient";
import { go } from "../lib/router";
import "../styles/delivery-tracking.css";

const labels:Record<DeliveryStatus,string>={order_received:"Order received",preparing:"Preparing order",ready_for_collection:"Ready for collection",dispatched:"Dispatched",out_for_delivery:"Out for delivery",delivered:"Delivered",collected:"Collected",exception:"Needs attention"};

function StatusIcon({status}:{status:DeliveryStatus}){
  if(status==="delivered"||status==="collected")return <CheckCircle2 size={20}/>;
  if(status==="exception")return <CircleAlert size={20}/>;
  if(status==="dispatched"||status==="out_for_delivery")return <Truck size={20}/>;
  if(status==="ready_for_collection")return <MapPin size={20}/>;
  return <PackageCheck size={20}/>;
}

export default function OrderTrackingPage({orderId}:{orderId:string}){
  const [tracking,setTracking]=useState<CustomerTracking|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  useEffect(()=>{let active=true;setLoading(true);setError("");getCustomerDeliveryTracking(orderId).then(({tracking})=>{if(active)setTracking(tracking);}).catch((err:any)=>{if(active)setError(err?.message||"Tracking could not be loaded.");}).finally(()=>{if(active)setLoading(false);});return()=>{active=false};},[orderId]);

  const latest=useMemo(()=>tracking?.events?.[tracking.events.length-1], [tracking]);

  if(loading)return <div className="sc-tracking-page"><Container><section className="sc-tracking-card"><Loader2 className="sc-spin"/><strong>Loading current order status…</strong></section></Container></div>;
  if(!tracking)return <div className="sc-tracking-page"><Container><section className="sc-tracking-card sc-tracking-card--error"><CircleAlert/><h1>Tracking isn’t available.</h1><p>{error||"We could not find tracking for this order."}</p><button type="button" onClick={()=>go("/account")}>Back to account</button></section></Container></div>;

  return <div className="sc-tracking-page"><Container className="sc-tracking-shell">
    <section className={`sc-tracking-hero is-${tracking.status}`}>
      <div className="sc-tracking-hero__icon"><StatusIcon status={tracking.status}/></div>
      <div><span>Order {tracking.orderId}</span><h1>{labels[tracking.status]}</h1><p>{latest?.message||"Your order status is synchronized with SmartCommerce delivery operations."}</p></div>
    </section>

    <section className="sc-tracking-grid">
      <div className="sc-tracking-summary">
        <h2>Fulfilment</h2>
        <dl>
          <div><dt>Method</dt><dd>{tracking.fulfilmentMode==="pickup"?"Store / courier collection":"Delivery"}</dd></div>
          {tracking.provider?<div><dt>Provider</dt><dd>{tracking.provider}</dd></div>:null}
          {tracking.serviceLabel?<div><dt>Service</dt><dd>{tracking.serviceLabel}</dd></div>:null}
          {tracking.collectionPointName?<div><dt>Collection point</dt><dd>{tracking.collectionPointName}</dd></div>:null}
          {tracking.trackingReference?<div><dt>Tracking reference</dt><dd>{tracking.trackingReference}</dd></div>:null}
          {tracking.scheduledFor?<div><dt>Scheduled</dt><dd>{new Date(tracking.scheduledFor).toLocaleString()}</dd></div>:null}
        </dl>
        {tracking.exceptionMessage?<div className="sc-tracking-exception"><CircleAlert size={18}/><span>{tracking.exceptionMessage}</span></div>:null}
        {tracking.completedAt?<div className="sc-tracking-proof"><CheckCircle2 size={18}/><div><strong>Completion recorded</strong><span>{new Date(tracking.completedAt).toLocaleString()}{tracking.proofRecipientName?` · received by ${tracking.proofRecipientName}`:""}</span>{tracking.proofReference?<small>Reference: {tracking.proofReference}</small>:null}</div></div>:null}
      </div>

      <div className="sc-tracking-timeline">
        <h2>Order journey</h2>
        <div>{tracking.events.map((event,index)=><article key={`${event.at}-${index}`} className={index===tracking.events.length-1?"is-current":""}><span className="sc-tracking-timeline__marker"/><div><strong>{labels[event.status]}</strong><p>{event.message||"Status updated."}</p><small><Clock3 size={13}/>{new Date(event.at).toLocaleString()}</small></div></article>)}</div>
      </div>
    </section>
  </Container></div>;
}
