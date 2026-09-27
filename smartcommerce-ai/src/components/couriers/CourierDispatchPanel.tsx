import {useCallback,useEffect,useRef,useState} from 'react';
import Button from '../shared/Button';
import {dispatchRequest,type DispatchPage} from '../../lib/courierDispatch';
import {useCourierMutation} from './useCourierMutation';
type Driver={id:string;name:string;active:boolean;verification:string};
export default function CourierDispatchPanel({staff=false,drivers=[],operational=false}:{staff?:boolean;drivers?:Driver[];operational?:boolean}){
 const [page,setPage]=useState<DispatchPage|null>(null),[cursor,setCursor]=useState<string>(),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const controller=useRef<AbortController|null>(null);
 const load=useCallback(async()=>{
   controller.current?.abort();const current=new AbortController();controller.current=current;setLoading(true);
   try{const data=await dispatchRequest(staff,undefined,cursor,current.signal) as DispatchPage;if(!current.signal.aborted){setPage(data);setError('');}}
   catch{if(!current.signal.aborted){setPage(null);setError('Dispatch could not be refreshed. Please try again.');}}
   finally{if(!current.signal.aborted)setLoading(false);}
 },[staff,cursor]);
 const mutation=useCourierMutation(command=>dispatchRequest(staff,command),()=>void load());
 const locked=mutation.busy||mutation.pending;
 useEffect(()=>{void load();const timer=setInterval(()=>{if(document.visibilityState==='visible'&&!locked)void load();},15000);return()=>{clearInterval(timer);controller.current?.abort();};},[load,locked]);
 return <section className="courier-card"><h2>{staff?'Dispatch oversight':'Delivery offers'}</h2><p>{operational?(staff?'Review offers and jobs at your authorized branches. Expired or declined offers require intervention.':'Accept each offer within ten minutes, then choose a verified driver. Declined offers go to Total Tools for review.'):'POS verification is not connected yet. Existing jobs are visible for reference; acceptance and assignment remain unavailable.'}</p>
 <Button variant="secondary" disabled={loading||locked} onClick={()=>void load()}>Refresh dispatch</Button>
 {page&&<p>Last checked: {new Date(page.checkedAt).toLocaleTimeString()}</p>}{error&&<p role="alert">{error}</p>}
 {page?.jobs.length===0&&<p>No dispatch jobs are available.</p>}
 {page?.jobs.map(job=><article className="courier-row" key={job.id}><h3>Order {job.orderNumber}</h3><p>Branch: {job.branchId}</p><p role={job.attention?'status':undefined}>{job.status.replaceAll('_',' ')} · {job.acceptance}{job.reason?' · '+job.reason.replaceAll('_',' '):''}</p>
 {job.acceptance==='pending'&&<p>Respond by {new Date(job.deadline).toLocaleString()}</p>}
 {!staff&&operational&&job.acceptance==='pending'&&<><Button disabled={locked||loading||Date.parse(job.deadline)<=Date.now()} onClick={()=>void mutation.execute({action:'accept',id:job.id,expectedVersion:job.version})}>Accept delivery</Button><form onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);void mutation.execute({action:'decline',id:job.id,expectedVersion:job.version,reason:data.get('reason')});}}><label>Reason for declining<select name="reason" required disabled={locked}><option value="">Choose a reason</option><option value="capacity">No capacity</option><option value="vehicle_unavailable">Vehicle unavailable</option><option value="coverage_issue">Coverage issue</option><option value="other">Other</option></select></label><Button variant="secondary" type="submit" disabled={locked||loading}>Decline delivery</Button></form></>}
 {!staff&&operational&&job.acceptance==='accepted'&&job.status==='awaiting_driver'&&<form onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);void mutation.execute({action:'assign',id:job.id,expectedVersion:job.version,driverId:data.get('driverId')});}}><label>Verified driver<select name="driverId" required disabled={locked}><option value="">Choose a driver</option>{drivers.filter(d=>d.active&&d.verification==='verified').map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label><Button type="submit" disabled={locked||loading}>Assign driver</Button></form>}
 </article>)}
 {mutation.error&&<p role="alert">{mutation.error}</p>}{mutation.pending&&<Button disabled={mutation.busy} onClick={()=>void mutation.execute()}>Retry same request</Button>}
 {cursor&&<Button variant="secondary" disabled={locked} onClick={()=>setCursor(undefined)}>First page</Button>}{page?.nextCursor&&<Button variant="secondary" disabled={locked} onClick={()=>setCursor(page.nextCursor||undefined)}>Next page</Button>}
 </section>;
}
