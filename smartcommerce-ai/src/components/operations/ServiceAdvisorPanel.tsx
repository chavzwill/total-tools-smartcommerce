import { AlertCircle, BadgeDollarSign, CheckCircle2, ClipboardCheck, Copy, Link2, PackageCheck, Save, ShieldCheck, XCircle } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { operationsRequest, type OperationsApiError } from "../../lib/staffOperations";
import "../../styles/service-advisor.css";

type Authorization = Record<string, any>;
type Props = {
  workOrder: Record<string, any>;
  staffEmployeeId?: string;
  canAssess?: boolean;
  canAssignParts?: boolean;
  onUpdated: () => Promise<void> | void;
};

const money = (value: unknown) => new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", maximumFractionDigits: 2 }).format(Number(value || 0));
const label = (value: unknown) => String(value || "—").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

async function authorizationRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", ...init, headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(init?.headers || {}) } });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || "Authorization workflow could not be updated.");
  return payload as T;
}

function publicAuthorizationUrl(token: string) {
  return `${window.location.origin}${window.location.pathname}#/repair-authorization?token=${encodeURIComponent(token)}`;
}

export default function ServiceAdvisorPanel({ workOrder, staffEmployeeId, canAssess = false, canAssignParts = false, onUpdated }: Props) {
  const [labor, setLabor] = useState(String(workOrder.estimate_labor || ""));
  const [consumables, setConsumables] = useState(String(workOrder.estimate_consumables || ""));
  const [deposit, setDeposit] = useState(String(workOrder.deposit_amount || ""));
  const [notes, setNotes] = useState(String(workOrder.estimate_notes || ""));
  const [auths, setAuths] = useState<Authorization[]>([]);
  const [scope, setScope] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [customerLink, setCustomerLink] = useState("");
  const [copied, setCopied] = useState(false);

  const partsTotal = useMemo(() => (workOrder.items || []).reduce((sum: number, item: any) => sum + Number(item.total || 0), 0), [workOrder.items]);
  const estimatedTotal = Number(workOrder.estimate_labor || 0) + Number(workOrder.estimate_consumables || 0) + partsTotal;
  const latest = auths[0];
  const estimateEditable = workOrder.status === "assessed" && canAssess;
  const canRequestAuthorization = canAssess && Number(workOrder.estimate_labor || 0) + Number(workOrder.estimate_consumables || 0) + partsTotal > 0;
  const partsConfirmable = canAssignParts && Array.isArray(workOrder.items) && workOrder.items.length > 0 && !["complete", "awaiting_pickup", "picked_up", "cancelled"].includes(String(workOrder.status));

  async function loadAuthorizations() {
    try {
      const result = await authorizationRequest<{ authorizations: Authorization[] }>(`/api/repair-authorizations?workOrderId=${encodeURIComponent(String(workOrder.id))}`);
      setAuths(result.authorizations || []);
    } catch { setAuths([]); }
  }

  useEffect(() => { setCustomerLink(""); setCopied(false); void loadAuthorizations(); }, [workOrder.id]);

  async function saveEstimate(event: FormEvent) {
    event.preventDefault();
    if (!estimateEditable || busy) return;
    setBusy("estimate"); setError("");
    try {
      await operationsRequest(`work-orders/${encodeURIComponent(String(workOrder.id))}/estimate`, { method: "PATCH", body: JSON.stringify({ estimate_labor: Number(labor || 0), estimate_consumables: Number(consumables || 0), estimate_notes: notes.trim() || null, deposit_amount: Number(deposit || 0), employee_id: staffEmployeeId || null }) });
      await onUpdated();
    } catch (e) { setError((e as OperationsApiError).message || "The repair estimate could not be saved."); }
    finally { setBusy(null); }
  }

  async function requestAuthorization() {
    if (!canRequestAuthorization || !scope.trim() || busy) return;
    setBusy("authorization"); setError(""); setCopied(false);
    try {
      const result = await authorizationRequest<{ customerToken?: string }>(`/api/repair-authorizations?workOrderId=${encodeURIComponent(String(workOrder.id))}`, { method: "POST", body: JSON.stringify({ action: "request_authorization", laborAmount: Number(workOrder.estimate_labor || 0), consumablesAmount: Number(workOrder.estimate_consumables || 0), partsAmount: partsTotal, depositAmount: Number(workOrder.deposit_amount || 0), scopeText: scope.trim(), reason: latest ? "Revised repair scope / change order" : "Initial repair authorization" }) });
      if (result.customerToken) setCustomerLink(publicAuthorizationUrl(result.customerToken));
      setScope(""); await loadAuthorizations();
    } catch (e) { setError(e instanceof Error ? e.message : "Authorization could not be requested."); }
    finally { setBusy(null); }
  }

  async function reissueCustomerLink() {
    if (!latest || latest.status !== "pending" || busy) return;
    setBusy("reissue-link"); setError(""); setCopied(false);
    try {
      const result = await authorizationRequest<{ customerToken: string }>(`/api/repair-authorizations?workOrderId=${encodeURIComponent(String(workOrder.id))}`, { method: "POST", body: JSON.stringify({ action: "reissue_customer_link", authorizationId: latest.id }) });
      setCustomerLink(publicAuthorizationUrl(result.customerToken));
      await loadAuthorizations();
    } catch (e) { setError(e instanceof Error ? e.message : "A new customer link could not be issued."); }
    finally { setBusy(null); }
  }

  async function copyCustomerLink() {
    if (!customerLink) return;
    try {
      await navigator.clipboard.writeText(customerLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Copying is not available on this device. Press and hold the link to copy it manually.");
    }
  }

  async function decide(decision: "approved" | "declined") {
    if (!latest || latest.status !== "pending" || busy) return;
    setBusy(decision); setError("");
    try {
      await authorizationRequest(`/api/repair-authorizations?workOrderId=${encodeURIComponent(String(workOrder.id))}`, { method: "POST", body: JSON.stringify({ action: "record_decision", authorizationId: latest.id, decision, channel: "staff_recorded", note: decisionNote.trim() || null }) });
      setDecisionNote(""); setCustomerLink(""); await loadAuthorizations();
    } catch (e) { setError(e instanceof Error ? e.message : "Decision could not be recorded."); }
    finally { setBusy(null); }
  }

  async function confirmParts() {
    if (!partsConfirmable || busy) return;
    setBusy("parts"); setError("");
    try {
      await operationsRequest(`work-orders/${encodeURIComponent(String(workOrder.id))}/confirm-parts`, { method: "POST", body: JSON.stringify({ employee_id: staffEmployeeId || null }) });
      await onUpdated();
    } catch (e) { setError((e as OperationsApiError).message || "Parts sourcing could not be confirmed."); }
    finally { setBusy(null); }
  }

  return <section className="sc-service-advisor" aria-label="Service advisor workflow" data-guide-id="service-advisor-workflow">
    <div className="sc-service-advisor__heading"><ClipboardCheck size={19}/><div><span>Service advisor</span><strong>Assessment, authorization & parts</strong></div><em>{label(workOrder.status)}</em></div>
    {error ? <div className="sc-service-advisor__error" role="alert"><AlertCircle size={15}/>{error}</div> : null}
    <div className="sc-service-advisor__summary">
      <article><span>Assessment fee</span><strong>{money(workOrder.assessment_fee)}</strong><small>{workOrder.assessment_transaction_id ? "Paid" : workOrder.status === "intake" ? "Awaiting payment" : "Processed"}</small></article>
      <article><span>Labor</span><strong>{money(workOrder.estimate_labor)}</strong><small>Estimate</small></article>
      <article><span>Consumables</span><strong>{money(workOrder.estimate_consumables)}</strong><small>Estimate</small></article>
      <article><span>Parts</span><strong>{money(partsTotal)}</strong><small>{workOrder.items?.length || 0} line(s)</small></article>
      <article><span>Total scope</span><strong>{money(estimatedTotal)}</strong><small>Current estimate</small></article>
      <article><span>Customer authorization</span><strong>{latest ? label(latest.status) : "Not requested"}</strong><small>{latest ? `Version ${latest.version}` : "Separate from payment"}</small></article>
    </div>

    {estimateEditable ? <form className="sc-service-advisor__estimate" onSubmit={saveEstimate}>
      <div className="sc-service-advisor__form-title"><BadgeDollarSign size={17}/><div><strong>Prepare estimate</strong><span>Save the source POS estimate, then issue a separate authorization request below.</span></div></div>
      <label>Labor (JMD)<input required min="0" step="0.01" value={labor} onChange={(e)=>setLabor(e.target.value)} data-guide-id="repair-estimate-labor"/></label>
      <label>Consumables (JMD)<input min="0" step="0.01" value={consumables} onChange={(e)=>setConsumables(e.target.value)} data-guide-id="repair-estimate-consumables"/></label>
      <label>Deposit (JMD)<input required min="0.01" step="0.01" value={deposit} onChange={(e)=>setDeposit(e.target.value)} data-guide-id="repair-estimate-deposit"/></label>
      <label className="is-wide">Estimate notes<textarea rows={3} value={notes} onChange={(e)=>setNotes(e.target.value)} data-guide-id="repair-estimate-notes"/></label>
      <button type="submit" disabled={busy === "estimate" || Number(deposit || 0) <= 0}><Save size={15}/>{busy === "estimate" ? "Saving…" : "Save estimate"}</button>
    </form> : null}

    {canRequestAuthorization ? <div className="sc-service-advisor__authorization">
      <div><ShieldCheck size={17}/><div><strong>{latest ? "Issue revised authorization / change order" : "Request customer authorization"}</strong><span>Approval is recorded independently from deposit/payment.</span></div></div>
      <textarea rows={3} value={scope} onChange={(e)=>setScope(e.target.value)} placeholder="Describe exactly what work, parts and limits the customer is authorizing" data-guide-id="repair-authorization-scope"/>
      <button type="button" onClick={()=>void requestAuthorization()} disabled={!scope.trim() || busy === "authorization"}><ShieldCheck size={15}/>{busy === "authorization" ? "Issuing…" : latest ? "Issue change order" : "Request authorization"}</button>
    </div> : null}

    {latest?.status === "pending" && canAssess ? <div className="sc-service-advisor__customer-link" data-guide-id="repair-authorization-link">
      <div><Link2 size={17}/><div><strong>Secure customer approval link</strong><span>The token is never stored in plaintext. Reissuing invalidates the previous link.</span></div></div>
      {customerLink ? <div className="sc-service-advisor__link-row"><input readOnly value={customerLink} aria-label="Customer repair authorization link"/><button type="button" onClick={()=>void copyCustomerLink()}><Copy size={15}/>{copied ? "Copied" : "Copy link"}</button></div> : <button type="button" onClick={()=>void reissueCustomerLink()} disabled={busy === "reissue-link"}><Link2 size={15}/>{busy === "reissue-link" ? "Issuing…" : "Generate new secure link"}</button>}
    </div> : null}

    {latest?.status === "pending" && canAssess ? <div className="sc-service-advisor__decision">
      <strong>Record customer decision manually</strong><input value={decisionNote} onChange={(e)=>setDecisionNote(e.target.value)} placeholder="Channel/reference/note (optional)"/>
      <button className="is-approve" type="button" onClick={()=>void decide("approved")} disabled={Boolean(busy)}><CheckCircle2 size={15}/>Approved</button>
      <button className="is-decline" type="button" onClick={()=>void decide("declined")} disabled={Boolean(busy)}><XCircle size={15}/>Declined</button>
    </div> : null}

    <div className="sc-service-advisor__parts"><div><PackageCheck size={17}/><div><strong>Parts sourcing</strong><span>Confirming converts unresolved branch sources into transfers or purchase requests using the POS engine.</span></div></div><button type="button" onClick={()=>void confirmParts()} disabled={!partsConfirmable || busy === "parts"}><PackageCheck size={15}/>{busy === "parts" ? "Confirming…" : "Confirm parts sourcing"}</button></div>
  </section>;
}
