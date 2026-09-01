import { FormEvent, useEffect, useState } from "react";
import { Copy, Loader2, ShieldCheck, UserPlus, Users } from "lucide-react";
import {
  acceptCommercialInvitation, changeCommercialMemberStatus, getCommercialInvitation,
  getCommercialTeam, inviteCommercialMember, type CommercialTeam,
} from "../services/commercialTeamClient";

function invitationToken() {
  const raw=window.location.hash.split("?")[1]||"";
  return new URLSearchParams(raw).get("invitation")||"";
}
function money(value:string|number|null|undefined,currency="JMD"){
  if(value==null||value==="")return "No limit";
  return new Intl.NumberFormat("en-JM",{style:"currency",currency,maximumFractionDigits:0}).format(Number(value)/100);
}
export default function CommercialTeamPanel({accountId,onAccepted}:{accountId:string;onAccepted?:(accountId:string)=>void}){
  const [team,setTeam]=useState<CommercialTeam|null>(null);
  const [email,setEmail]=useState(""); const [role,setRole]=useState("buyer");
  const [orderLimit,setOrderLimit]=useState(""); const [approvalLimit,setApprovalLimit]=useState("");
  const [busy,setBusy]=useState(false); const [message,setMessage]=useState(""); const [acceptUrl,setAcceptUrl]=useState("");
  const token=invitationToken();
  useEffect(()=>{if(!accountId)return;getCommercialTeam(accountId).then(setTeam).catch((e:Error)=>setMessage(e.message))},[accountId]);
  useEffect(()=>{if(!token)return;getCommercialInvitation(token).then(({invitation})=>setMessage(invitation.emailMatches?`You were invited to join ${invitation.displayName} as ${invitation.role}.`:`Sign in with the verified email address invited to ${invitation.displayName}.`)).catch((e:Error)=>setMessage(e.message))},[token]);
  async function accept(){setBusy(true);try{const result=await acceptCommercialInvitation(token);setMessage("Invitation accepted. Your individual company access is active.");onAccepted?.(result.accountId)}catch(e){setMessage(e instanceof Error?e.message:"Invitation could not be accepted.")}finally{setBusy(false)}}
  async function invite(event:FormEvent){event.preventDefault();setBusy(true);setMessage("");try{
    const result=await inviteCommercialMember({accountId,email,role,spendLimitOrderMinor:orderLimit?Math.round(Number(orderLimit)*100):null,approvalLimitMinor:approvalLimit?Math.round(Number(approvalLimit)*100):null,currency:"JMD"});
    setAcceptUrl(result.invitation.acceptUrl);setEmail("");setMessage("Invitation created. The secure link expires in 72 hours.");setTeam(await getCommercialTeam(accountId));
  }catch(e){setMessage(e instanceof Error?e.message:"Invitation could not be created.")}finally{setBusy(false)}}
  async function status(memberId:string,action:"suspend_member"|"revoke_member"|"reactivate_member"){setBusy(true);try{const result=await changeCommercialMemberStatus(accountId,memberId,action);setTeam(result.team);setMessage(action==="reactivate_member"?"Member access restored.":action==="suspend_member"?"Member access suspended.":"Member access revoked.")}catch(e){setMessage(e instanceof Error?e.message:"Member access could not be changed.")}finally{setBusy(false)}}
  return <section className="sc-commercial-team" aria-labelledby="commercial-team-title">
    <div className="sc-commercial-team__heading"><Users size={24}/><div><span className="sc-flow-kicker">Company team</span><h3 id="commercial-team-title">Individual access, clear authority</h3><p>Every person signs in with their own SmartCommerce account. Shared company passwords are never required.</p></div></div>
    {token?<div className="sc-commercial-team__invite"><ShieldCheck size={20}/><p>{message}</p><button type="button" onClick={accept} disabled={busy}>{busy?<><Loader2 size={16}/>Accepting…</>:"Accept invitation"}</button></div>:null}
    {team?.canManage?<form className="demo-flow-form sc-commercial-team__form" onSubmit={invite}>
      <UserPlus size={22}/><h4>Invite a team member</h4>
      <label>Work email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="purchasing@company.com"/></label>
      <label>Role<select value={role} onChange={e=>setRole(e.target.value)}><option value="buyer">Buyer</option><option value="approver">Approver</option><option value="admin">Administrator</option><option value="owner">Owner</option></select></label>
      <label>Maximum per order (JMD)<input type="number" min="0" step="1" value={orderLimit} onChange={e=>setOrderLimit(e.target.value)} placeholder="75000"/></label>
      <label>Approval authority (JMD)<input type="number" min="0" step="1" value={approvalLimit} onChange={e=>setApprovalLimit(e.target.value)} placeholder="250000"/></label>
      <button disabled={busy}>{busy?"Creating invitation…":"Create secure invitation"}</button>
    </form>:null}
    {acceptUrl?<div className="sc-commercial-team__link"><label>Secure invitation link<input readOnly value={acceptUrl}/></label><button type="button" onClick={()=>navigator.clipboard.writeText(acceptUrl)}><Copy size={16}/>Copy link</button><small>Share only with the invited person. It expires after 72 hours and can be used once.</small></div>:null}
    {team?<div className="sc-commercial-team__members">{team.members.map(member=><article key={member.id}>
      <div><strong>{member.full_name}</strong><span>{member.role} · {member.status}</span>{member.email?<small>{member.email}</small>:null}</div>
      <div><span>Order limit: {money(member.spend_limit_order_minor,member.currency||"JMD")}</span><span>Approval: {money(member.approval_limit_minor,member.currency||"JMD")}</span></div>
      {team.canManage&&member.status==="active"?<button type="button" disabled={busy} onClick={()=>status(member.id,"suspend_member")}>Suspend</button>:null}
      {team.canManage&&member.status==="suspended"?<><button type="button" disabled={busy} onClick={()=>status(member.id,"reactivate_member")}>Restore</button><button type="button" disabled={busy} onClick={()=>status(member.id,"revoke_member")}>Revoke</button></>:null}
    </article>)}</div>:<p><Loader2 size={16}/> Loading company team…</p>}
    {message&&!token?<p className="sc-flow-status" role="status">{message}</p>:null}
  </section>
}
