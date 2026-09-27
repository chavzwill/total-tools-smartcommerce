import {useEffect,useState} from 'react';
import {CourierClientError,courierCommand,getCourierWorkspace} from '../lib/couriers';
import type {CourierService,CourierWorkspace} from '../types/courier';
import Button from '../components/shared/Button';
import CourierApplicationForm from '../components/couriers/CourierApplicationForm';
import CourierServiceForm from '../components/couriers/CourierServiceForm';
import {useCourierMutation} from '../components/couriers/useCourierMutation';
import CourierPrivatePanel from '../components/couriers/CourierPrivatePanel';
import '../styles/couriers.css';
export default function CourierPortalPage(){
  const [workspace,setWorkspace]=useState<CourierWorkspace|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[signIn,setSignIn]=useState(false);
  const [view,setView]=useState<'business'|'driver'>('business');
  const [editing,setEditing]=useState<CourierService|'new'|null>(null);
  async function load(){setLoading(true);setError('');setSignIn(false);try{setWorkspace(await getCourierWorkspace());}catch(e){setSignIn(e instanceof CourierClientError&&e.status===401);setError(e instanceof CourierClientError?e.message:'Courier services could not be loaded. Please try again.');}finally{setLoading(false);}}
  useEffect(()=>{void load();},[]);
  const updateService=(service:CourierService)=>{setWorkspace(w=>w?{...w,services:[service,...w.services.filter(s=>s.id!==service.id)]}:w);setEditing(null);};
  const mutation=useCourierMutation(courierCommand<CourierService>,updateService);
  const app=workspace?.application;
  return <main className="courier-page"><header><span className="courier-eyebrow">Deliver with Total Tools</span><h1>Your delivery business.<br/>Our customers.</h1><p>Apply to become a courier and manage the services you offer through SmartCommerce.</p><p className="courier-note">Registration and identity decisions are made in the POS. The POS review connection is not ready; applications saved as submitted have not been sent for a POS decision and cannot unlock delivery work.</p></header>
    {loading?<p role="status">Loading courier account…</p>:error?<section className="courier-card"><h2>{signIn?'Sign in to get started':'Courier portal unavailable'}</h2><p role="alert">{error}</p>{signIn?<a className="tt-button tt-button--primary" href="#/couriers/account">Sign in or create an account</a>:<Button onClick={()=>void load()}>Try again</Button>}</section>:workspace&&<>
      <div className="courier-actions"><Button variant="secondary" onClick={()=>setView("business")}>Business profile</Button><Button variant="secondary" onClick={()=>setView("driver")}>Driver access & private details</Button><Button variant="ghost" onClick={async()=>{try{const r=await fetch("/api/courier-account",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"logout"})});if(!r.ok)throw new Error();window.location.hash="/couriers/account";}catch{setError("Sign out could not be confirmed. Please try again.");}}}>Sign out of courier account</Button></div>
      <div hidden={view!=="business"} className="courier-layout"><CourierApplicationForm key={`${app?.id||'new'}:${app?.version||0}`} application={app||null} onSaved={application=>setWorkspace({...workspace,application})}/><aside><section className="courier-card"><h2>Application status</h2><span className="courier-status">{app?.status==='approved'&&!workspace.bookingAvailable?'Awaiting POS verification':app?.status||'Not started'}</span><p>{app?.status==='approved'?'A historical approval is recorded, but POS verification is not connected. Delivery work remains unavailable.':app?.status==='submitted'?'Your application is saved as submitted in SmartCommerce. POS handoff is pending; no approval decision has been requested yet.':app?.status==='suspended'?'Your business is suspended. Its services are unavailable.':'Save your business details, then submit your application for POS approval.'}</p>{app?.decisionReason&&<p className="courier-note">{app.decisionReason}</p>}</section><section className="courier-card"><h2>What happens next</h2><ol><li>Complete your business details.</li><li>Mark the application ready for POS handoff.</li><li>Configure your delivery services and rates.</li></ol><p className="courier-note">Courier selection at checkout and customer payments are not enabled yet. Assigned deliveries, status updates and proof are managed below when real orders are connected.</p></section></aside></div>
      <CourierPrivatePanel organizationId={app?.id}/>
      {app&&<section><h2>Your delivery services</h2><p>Set up coverage, hours and rates privately. Customers cannot see or select a courier until POS approval and verification are connected.</p>
        {!workspace.references.areas.length||!workspace.references.categories.length||!workspace.references.currencies.length?<section className="courier-card"><h3>Service setup is not ready</h3><p>Total Tools must configure service areas, item categories and currencies before you can add a service.</p></section>:editing?<CourierServiceForm key={editing==='new'?'new':editing.id} organizationId={app.id} service={editing==='new'?undefined:editing} references={workspace.references} onSaved={updateService} onCancel={()=>setEditing(null)}/>:<>
          <Button disabled={mutation.busy||mutation.pending||workspace.services.length>=50} onClick={()=>setEditing('new')}>Add delivery service</Button>
          {!workspace.services.length&&<p>No services yet. Add your coverage, working hours and rates.</p>}
          {workspace.services.map(s=><article key={s.id} className="courier-card"><h3>{s.input.name}</h3><span className="courier-status">{!s.published?'Unpublished':!workspace.bookingAvailable?'Configured — checkout unavailable':app.status!=='approved'?'Unavailable — approval required':!s.input.available?'Published — unavailable':'Published'}</span><p>{s.input.minBusinessDays}–{s.input.maxBusinessDays} business days · {s.input.rates.length} rate bands · {s.input.currency}</p><div className="courier-actions"><Button variant="secondary" disabled={mutation.busy||mutation.pending} onClick={()=>setEditing(s)}>Edit service</Button><Button disabled={mutation.busy||mutation.pending||(!s.published&&app.status!=='approved')} onClick={()=>void mutation.execute({action:s.published?'pause_service':'publish_service',id:s.id,organizationId:app.id,expectedVersion:s.version})}>{s.published?'Unpublish':'Prepare service'}</Button></div></article>)}
        </>}
        {mutation.error&&<p role="alert">{mutation.error}</p>}{mutation.pending&&<Button disabled={mutation.busy} onClick={()=>void mutation.execute()}>Retry same request</Button>}
      </section>}
    </>}
  </main>;
}
