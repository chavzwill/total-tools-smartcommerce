import {useState} from 'react';
import type {CourierApplication,CourierApplicationInput} from '../../types/courier';
import Button from '../shared/Button';
import {courierCommand} from '../../lib/couriers';
import {useCourierMutation} from './useCourierMutation';
export default function CourierApplicationForm({application,onSaved}:{application:CourierApplication|null;onSaved:(app:CourierApplication)=>void}){
  const [id]=useState(()=>application?.id||crypto.randomUUID());
  const [input,setInput]=useState<CourierApplicationInput>(()=>application?{businessName:application.businessName,contactName:application.contactName,email:application.email,phone:application.phone,description:application.description}:{businessName:'',contactName:'',email:'',phone:'',description:''});
  const mutation=useCourierMutation(courierCommand<CourierApplication>,onSaved);
  const editable=!application||['draft','rejected'].includes(application.status);
  const dirty=!application||Object.entries(input).some(([key,value])=>application[key as keyof CourierApplicationInput]!==value);
  return <section className="courier-card"><h2>Business details</h2><p>Tell us about your delivery business. Save your details before submitting for review.</p>
    <form onSubmit={e=>{e.preventDefault();void mutation.execute({action:application?'save_application':'create_application',id,...(application?{expectedVersion:application.version}:{}),input});}}>
      <fieldset disabled={!editable||mutation.busy||mutation.pending} className="courier-fields">
        <label>Business name<input required maxLength={120} autoComplete="organization" value={input.businessName} onChange={e=>setInput({...input,businessName:e.target.value})}/></label>
        <div className="courier-grid"><label>Contact name<input required maxLength={120} autoComplete="name" value={input.contactName} onChange={e=>setInput({...input,contactName:e.target.value})}/></label><label>Email address<input required type="email" maxLength={254} autoComplete="email" value={input.email} onChange={e=>setInput({...input,email:e.target.value})}/></label></div>
        <label>Phone number<input required type="tel" maxLength={32} autoComplete="tel" value={input.phone} onChange={e=>setInput({...input,phone:e.target.value})}/></label>
        <label>About your delivery service<textarea required rows={5} maxLength={2000} value={input.description} onChange={e=>setInput({...input,description:e.target.value})}/></label>
        {editable&&<Button type="submit" disabled={!dirty}>Save details</Button>}
      </fieldset>
    </form>
    {editable&&application&&<Button type="button" variant="secondary" disabled={dirty||mutation.busy||mutation.pending} onClick={()=>void mutation.execute({action:'submit_application',id,expectedVersion:application.version})}>Submit for POS review</Button>}
    {mutation.error&&<p role="alert">{mutation.error}</p>}{mutation.pending&&<Button type="button" disabled={mutation.busy} onClick={()=>void mutation.execute()}>Retry same request</Button>}
    {mutation.busy&&<p role="status">Saving…</p>}
  </section>;
}
