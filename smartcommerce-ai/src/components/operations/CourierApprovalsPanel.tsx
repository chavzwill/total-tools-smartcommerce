import {useEffect,useState} from 'react';
import {getCourierApprovalQueue} from '../../lib/couriers';
import type {CourierApplication} from '../../types/courier';
import Button from '../shared/Button';
import '../../styles/couriers.css';
export default function CourierApprovalsPanel(){
 const [applications,setApplications]=useState<CourierApplication[]>([]),[cursor,setCursor]=useState<string|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 async function load(next?:string){setLoading(true);setError('');try{const page=await getCourierApprovalQueue(next);setApplications(items=>next?[...items,...page.applications]:page.applications);setCursor(page.nextCursor);}catch{setError('Applications could not be loaded.');}finally{setLoading(false);}}
 useEffect(()=>{void load();},[]);
 return <section className="courier-page"><h2>Courier registration status</h2><p>Courier approval, identity verification, rejection and suspension are managed in the POS. SmartCommerce collects applications and documents only.</p><p className="courier-note">POS review is not connected yet. Submitted registrations await POS review. Any previous local status is historical and does not authorize delivery work.</p><Button variant="secondary" disabled={loading} onClick={()=>void load()}>Refresh applications</Button>{error&&<p role="alert">{error}</p>}{loading&&<p role="status">Loading applications…</p>}{!loading&&!error&&!applications.length&&<p>No courier applications yet.</p>}{applications.map(app=><article className="courier-card" key={app.id}><h3>{app.businessName}</h3><p>{app.status==='draft'?'Draft registration':'Awaiting POS review'}</p><p>{app.contactName} · {app.email} · {app.phone}</p><p>{app.description}</p><details><summary>Previous recorded history</summary><p>Recorded status: {app.status}. This is not confirmed POS approval.</p><ol>{app.history?.map((event,i)=><li key={i}>{event.action.replaceAll('_',' ')}{event.reason?' — '+event.reason:''}</li>)}</ol></details></article>)}{cursor&&<Button disabled={loading} onClick={()=>void load(cursor)}>Load more</Button>}</section>;
}
