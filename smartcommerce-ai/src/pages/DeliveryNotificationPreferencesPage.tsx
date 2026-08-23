import { BellRing, CheckCircle2, Loader2, Mail, MessageCircle, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import Container from "../components/shared/Container";
import { getDeliveryNotificationPreferences, updateDeliveryNotificationPreferences, type DeliveryNotificationPreferences } from "../services/deliveryNotificationPreferencesClient";

export default function DeliveryNotificationPreferencesPage(){
  const[prefs,setPrefs]=useState<DeliveryNotificationPreferences|null>(null);const[loading,setLoading]=useState(true);const[saving,setSaving]=useState(false);const[error,setError]=useState("");const[notice,setNotice]=useState("");
  useEffect(()=>{let active=true;getDeliveryNotificationPreferences().then(({preferences})=>{if(active)setPrefs(preferences)}).catch((err:any)=>{if(active)setError(err?.message||"Notification preferences could not be loaded.")}).finally(()=>{if(active)setLoading(false)});return()=>{active=false};},[]);
  async function save(next:DeliveryNotificationPreferences){setSaving(true);setError("");setNotice("");try{const result=await updateDeliveryNotificationPreferences({emailEnabled:next.emailEnabled,smsEnabled:next.smsEnabled,whatsappEnabled:next.whatsappEnabled});setPrefs(result.preferences);setNotice("Delivery notification preferences updated.");}catch(err:any){setError(err?.message||"Notification preferences could not be updated.");}finally{setSaving(false);}}
  if(loading)return <div className="demo-page"><Container className="demo-page-content"><div className="demo-empty"><Loader2 className="sc-spin"/><h2>Loading notification settings…</h2></div></Container></div>;
  if(!prefs)return <div className="demo-page"><Container className="demo-page-content"><div className="demo-empty"><BellRing/><h2>Notification settings unavailable</h2><p>{error}</p></div></Container></div>;
  const phoneVerified=Boolean(prefs.phoneVerifiedAt);
  return <div className="demo-page"><section className="demo-page-hero"><Container><span>Account settings</span><h1>Delivery notifications</h1><p>Choose how SmartCommerce should contact you about order preparation, dispatch, collection and delivery exceptions. In-app order tracking remains available regardless of these settings.</p></Container></section><Container className="demo-page-content"><section className="sc-notification-preferences">
    <article><div><Mail size={20}/><div><strong>Email</strong><span>Transactional order and delivery updates.</span></div></div><label><input type="checkbox" checked={prefs.emailEnabled} disabled={saving} onChange={e=>void save({...prefs,emailEnabled:e.target.checked})}/><span>{prefs.emailEnabled?"On":"Off"}</span></label></article>
    <article><div><Smartphone size={20}/><div><strong>SMS</strong><span>{phoneVerified?"Text-message delivery updates.":"Phone verification is required before SMS can be enabled."}</span></div></div><label><input type="checkbox" checked={prefs.smsEnabled} disabled={saving||!phoneVerified} onChange={e=>void save({...prefs,smsEnabled:e.target.checked})}/><span>{prefs.smsEnabled?"On":"Off"}</span></label></article>
    <article><div><MessageCircle size={20}/><div><strong>WhatsApp</strong><span>{phoneVerified?"Approved WhatsApp order-status notifications.":"Phone verification and WhatsApp opt-in are required before this channel can be enabled."}</span></div></div><label><input type="checkbox" checked={prefs.whatsappEnabled} disabled={saving||!phoneVerified} onChange={e=>void save({...prefs,whatsappEnabled:e.target.checked})}/><span>{prefs.whatsappEnabled?"On":"Off"}</span></label></article>
    <div className="sc-notification-preferences__note"><CheckCircle2 size={18}/><div><strong>In-app tracking stays on.</strong><span>These controls only affect external messages. Your authenticated order-tracking timeline remains the source of truth.</span></div></div>
    {notice?<p role="status">{notice}</p>:null}{error?<p role="alert">{error}</p>:null}
  </section></Container></div>;
}
