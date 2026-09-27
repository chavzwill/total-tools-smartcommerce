import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {CheckCircle2,Clock3,MapPin,PackageCheck,Truck} from 'lucide-react';
import Button from '../shared/Button';
import {deliveryRequest,type DeliveryAudience,type DeliveryPage,type DeliveryRecord} from '../../lib/courierDelivery';
import {CourierClientError} from '../../lib/couriers';
import {useCourierMutation} from './useCourierMutation';
import '../../styles/couriers.css';

const label=(value:string)=>value.replaceAll('_',' ');
const when=(value:string|null)=>value?new Date(value).toLocaleString():'Not yet recorded';

export default function CourierDeliveryPanel({audience}:{audience:DeliveryAudience}){
  const [page,setPage]=useState<DeliveryPage|null>(null),[cursor,setCursor]=useState<string>(),[selected,setSelected]=useState<DeliveryRecord|null>(null);
  const [error,setError]=useState(''),[loading,setLoading]=useState(false),[locked,setLocked]=useState(false);
  const request=useRef<AbortController|null>(null);
  const load=useCallback(async()=>{
    request.current?.abort();const controller=new AbortController();request.current=controller;setLoading(true);
    try{
      const result=await deliveryRequest(audience,undefined,cursor,controller.signal) as DeliveryPage;
      if(controller.signal.aborted)return;
      setPage(result);setSelected(previous=>result.deliveries.find(d=>d.id===previous?.id)||result.deliveries[0]||null);setError('');
    }catch(e){if(!controller.signal.aborted){setError(e instanceof CourierClientError?e.message:'Updates could not be refreshed. The last received information may be out of date.');if(e instanceof CourierClientError&&[401,403].includes(e.status)){setPage(null);setSelected(null);}}}
    finally{if(!controller.signal.aborted)setLoading(false);}
  },[audience,cursor]);
  useEffect(()=>{
    void load();const refresh=()=>{if(document.visibilityState==='visible')void load();};
    const timer=setInterval(refresh,30000);document.addEventListener('visibilitychange',refresh);window.addEventListener('online',refresh);
    return()=>{request.current?.abort();clearInterval(timer);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('online',refresh);};
  },[load]);
  return <section className="courier-page courier-deliveries" aria-label="Delivery tracking">
    <div className="courier-delivery-heading"><div><span className="courier-eyebrow">Delivery updates</span><h2>{audience==='customer'?'Your deliveries':'Deliveries'}</h2></div><Button variant="secondary" disabled={loading} onClick={()=>void load()}>Refresh deliveries</Button></div>
    <p>Updates refresh every 30 seconds while this page is visible. Last checked: {when(page?.checkedAt||null)}.</p>
    {error&&<p role="alert">{error}</p>}{loading&&!page&&<p role="status">Loading deliveries…</p>}
    {page&&!page.deliveries.length&&<div className="courier-card"><PackageCheck aria-hidden="true"/><h3>No assigned deliveries yet</h3><p>Deliveries appear here when an order is assigned and linked to your account.</p></div>}
    {page&&page.deliveries.length>1&&<label>Choose delivery<select value={selected?.id||''} disabled={locked} onChange={e=>setSelected(page.deliveries.find(d=>d.id===e.target.value)||null)}>{page.deliveries.map(d=><option key={d.id} value={d.id}>{d.orderNumber} — {label(d.status)}</option>)}</select></label>}
    {selected&&<DeliveryDetail key={selected.id} record={selected} audience={audience} refresh={load} onLock={setLocked}/>}
    <div className="courier-actions">{cursor&&<Button variant="secondary" disabled={locked||loading} onClick={()=>setCursor(undefined)}>First page</Button>}{page?.nextCursor&&<Button variant="secondary" disabled={locked||loading} onClick={()=>setCursor(page.nextCursor||undefined)}>Next deliveries</Button>}</div>
  </section>;
}

function DeliveryDetail({record,audience,refresh,onLock}:{record:DeliveryRecord;audience:DeliveryAudience;refresh:()=>Promise<void>;onLock:(value:boolean)=>void}){
  const [reason,setReason]=useState(''),[recipient,setRecipient]=useState(''),[file,setFile]=useState<File|null>(null);
  const [receiptReason,setReceiptReason]=useState('');
  const [receiptRecorded,setReceiptRecorded]=useState(false);
  const [reading,setReading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[proof,setProof]=useState<{recipient:string;mime:string;data:string;createdAt:string}|null>(null);
  const mutation=useCourierMutation<any>(command=>deliveryRequest(audience,command),result=>{
    if(result.data){if(!['image/png','image/jpeg'].includes(result.mime)||typeof result.data!=='string'){setError('Delivery evidence could not be displayed.');return;}setProof(result);}
    else{if(result.status==='accepted'||result.status==='problem_reported')setReceiptRecorded(true);setNotice(result.status==='accepted'||result.status==='problem_reported'?`Your receipt response was recorded: ${label(result.status)}.`:`Recorded: ${label(result.event||result.status)}. Current stage: ${label(result.status)}.`);setFile(null);setRecipient('');setReason('');setReceiptReason('');void refresh();}
  });
  const locked=reading||mutation.busy||mutation.pending;
  useEffect(()=>{onLock(locked);return()=>onLock(false);},[locked,onLock]);
  function update(status:string){setError('');setNotice('');void mutation.execute({action:'update_status',id:record.id,expectedVersion:record.version,status,...(['delayed','failed_attempt'].includes(status)?{reason}:{})});}
  async function deliver(event:FormEvent){
    event.preventDefault();if(locked)return;
    if(!file||!recipient.trim()){setError('Enter the recipient name and choose a delivery photo.');return;}
    if(file.size>2*1024*1024||!['image/jpeg','image/png'].includes(file.type)){setError('Choose a JPEG or PNG photo no larger than 2 MB.');return;}
    setReading(true);setError('');setNotice('');
    try{
      const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error());reader.readAsDataURL(file);});
      await mutation.execute({action:'update_status',id:record.id,expectedVersion:record.version,status:'delivered',proof:{recipient:recipient.trim(),mime:file.type,data}});
    }catch{setError('The photo could not be read. Choose the file again.');}finally{setReading(false);}
  }
  return <article className="courier-delivery-layout">
    <div className="courier-card"><h3 className="courier-delivery-reference">{record.orderNumber}</h3><span className="courier-status">{label(record.status)}</span><p>Last delivery update: {when(record.updatedAt)}</p>
      {record.status==='delivered'&&<p role="status">{record.receiptStatus==='accepted'?`Customer confirmed receipt in good condition on ${when(record.receiptAt)}.`:record.receiptStatus==='problem_reported'?`Customer reported a delivery problem on ${when(record.receiptAt)}${record.receiptReason?` (${label(record.receiptReason)})`:''}. Courier payment remains on hold.`:'The driver recorded delivery with proof. Customer condition confirmation is pending; courier payment remains on hold.'}</p>}
      <section className="courier-delivery-section"><h3><PackageCheck size={20} aria-hidden="true"/> Order details</h3><ul>{record.items.map((item,index)=><li key={index}>{item.name||item.sku||'Item'} — quantity {item.quantity}</li>)}</ul><h3><MapPin size={20} aria-hidden="true"/> Destination</h3><dl>{Object.entries(record.destination).filter(([,value])=>typeof value==='string').map(([key,value])=><div key={key}><dt>{label(key)}</dt><dd>{String(value)}</dd></div>)}</dl></section>
      <section className="courier-delivery-section"><h3><Clock3 size={20} aria-hidden="true"/> Event history</h3>{!record.events.length?<p>No driver updates recorded yet.</p>:<><ol className="courier-delivery-timeline">{record.events.map(event=><li key={event.version}><strong>{label(event.event)}</strong>{event.reason&&<p>{label(event.reason)}</p>}<time dateTime={event.receivedAt}>Received {when(event.receivedAt)}</time><small>Driver reported {when(event.reportedAt)}</small></li>)}</ol>{record.events.length===100&&<p>Showing the latest 100 updates.</p>}</>}</section>
    </div>
    <div><section className="courier-card"><h3><Truck size={20} aria-hidden="true"/> {record.canUpdate&&audience==='courier'?'Update delivery':'Delivery record'}</h3>
      {record.canUpdate&&audience==='courier'?<>
        <div className="courier-actions">{record.status==='collected'&&<Button disabled={locked} onClick={()=>update('in_transit')}>Mark in transit</Button>}{record.status==='in_transit'&&<Button disabled={locked} onClick={()=>update('out_for_delivery')}>Mark out for delivery</Button>}</div>
        <div className="courier-delivery-section"><label>Reason for a delay or failed attempt<select value={reason} disabled={locked} onChange={e=>setReason(e.target.value)}><option value="">Choose a reason</option>{['traffic','weather','vehicle_issue','recipient_unavailable','address_issue','other'].map(value=><option key={value} value={value}>{label(value)}</option>)}</select></label><div className="courier-actions"><Button variant="secondary" disabled={locked||!reason} onClick={()=>update('delayed')}>Report delay</Button>{record.status==='out_for_delivery'&&<Button variant="secondary" disabled={locked||!reason} onClick={()=>update('failed_attempt')}>Report failed attempt</Button>}</div></div>
        {record.status==='out_for_delivery'&&<form className="courier-delivery-proof-form" onSubmit={e=>void deliver(e)}><h3><CheckCircle2 size={20} aria-hidden="true"/> Confirm delivery</h3><p>Record the recipient and delivery photo. Confirmation saves both the evidence and delivery status.</p><fieldset className="courier-fields" disabled={locked}><label>Recipient name<input required maxLength={120} value={recipient} onChange={e=>setRecipient(e.target.value)} autoComplete="off"/></label><label>Delivery photo<input type="file" required accept="image/jpeg,image/png" onChange={e=>setFile(e.target.files?.[0]||null)}/></label><p>JPEG or PNG, up to 2 MB. Include only what is needed to show the delivery.</p><Button type="submit">Confirm delivery with proof</Button></fieldset></form>}
      </>:<p>{record.status==='delivered'?'The assigned driver has recorded delivery. Customer condition confirmation is tracked separately.':audience==='courier'?'Live delivery updates are unavailable until POS verification is connected.':'This is the latest saved shipment status.'}</p>}
      {audience==='customer'&&record.canConfirm&&!receiptRecorded&&<div className="courier-delivery-section"><h3>Confirm your order’s condition</h3><p>The driver supplied delivery evidence. Confirm only if you received the listed items in good condition; otherwise report the problem. This response cannot be changed here.</p><Button disabled={locked} onClick={()=>void mutation.execute({action:'confirm_receipt',id:record.id,expectedVersion:0})}>Received in good condition</Button><label>Report a problem<select value={receiptReason} disabled={locked} onChange={e=>setReceiptReason(e.target.value)}><option value="">Choose a problem</option>{[['damaged','Damaged'],['missing_items','Missing items'],['wrong_items','Wrong items'],['not_received','Not received'],['other','Other problem']].map(([value,text])=><option key={value} value={value}>{text}</option>)}</select></label><Button variant="secondary" disabled={locked||!receiptReason} onClick={()=>void mutation.execute({action:'report_problem',id:record.id,expectedVersion:0,reason:receiptReason})}>Report problem</Button></div>}
      {record.hasProof&&<Button variant="secondary" disabled={locked} onClick={()=>void mutation.execute({action:'read_proof',id:record.id})}>View delivery proof</Button>}
      {(error||mutation.error)&&<p role="alert">{error||mutation.error}</p>}{mutation.pending&&<Button disabled={mutation.busy} onClick={()=>void mutation.execute()}>Retry same request</Button>}{notice&&<p role="status">{notice}</p>}
    </section>{proof&&<section className="courier-card"><h3>Private delivery evidence</h3><p>Recipient: {proof.recipient}</p><p>Recorded {when(proof.createdAt)}</p><img className="courier-proof-image" src={`data:${proof.mime};base64,${proof.data}`} alt="Delivery evidence submitted by the assigned driver"/><Button variant="secondary" onClick={()=>setProof(null)}>Close evidence</Button></section>}</div>
  </article>;
}
