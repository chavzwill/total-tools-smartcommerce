import { AlertCircle, CheckCircle2, Clock3, MessageCircle, RefreshCw, Send, ShieldCheck, Wrench, XCircle } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import "../../styles/accountRepairs.css";

type Repair = Record<string, any>;
type RepairsResponse = { linked: boolean; repairs: Repair[]; message?: string; syncWarning?: string; error?: { message?: string } };

const money = (value: unknown) => new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", maximumFractionDigits: 2 }).format(Number(value || 0));
const label = (value: unknown) => String(value || "—").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const dateTime = (value: unknown) => value ? new Date(String(value)).toLocaleString() : "—";

async function loadRepairs(): Promise<RepairsResponse> {
  const response = await fetch("/api/customer-repairs", { credentials: "same-origin", headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || "Repair information could not be loaded.");
  return payload;
}

async function submitRepairAction(payload: Record<string, unknown>) {
  const response = await fetch("/api/customer-repair-actions", {
    method: "POST",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || "Your repair action could not be completed.");
  return body;
}

export default function AccountRepairsPanel() {
  const [state, setState] = useState<{ loading: boolean; data?: RepairsResponse; error?: string }>({ loading: true });
  const [selected, setSelected] = useState<string | null>(null);
  const [actionState, setActionState] = useState<{ busy: boolean; error?: string; notice?: string }>({ busy: false });
  const [decisionNotes, setDecisionNotes] = useState("");
  const [message, setMessage] = useState("");

  async function load(quiet = false) {
    if (!quiet) setState((current) => ({ ...current, loading: true, error: undefined }));
    try {
      const data = await loadRepairs(); setState({ loading: false, data });
      if (!selected && data.repairs?.[0]?.work_order_id != null) setSelected(String(data.repairs[0].work_order_id));
    } catch (error) { if (!quiet) setState({ loading: false, error: error instanceof Error ? error.message : "Repair information could not be loaded." }); }
  }
  useEffect(() => { void load(); }, []);

  const repairs = state.data?.repairs || [];
  const active = useMemo(() => repairs.filter((repair) => !["picked_up", "cancelled"].includes(String(repair.status))).length, [repairs]);
  const completed = useMemo(() => repairs.filter((repair) => ["complete", "awaiting_pickup", "picked_up"].includes(String(repair.status))).length, [repairs]);
  const awaitingResponse = useMemo(() => repairs.reduce((sum, repair) => sum + Number(repair.awaiting_customer_response_count || 0), 0), [repairs]);
  const current = selected ? repairs.find((repair) => String(repair.work_order_id) === selected) : repairs[0];
  const pendingEstimate = useMemo(() => {
    if (!current || !Array.isArray(current.estimates)) return null;
    return [...current.estimates].reverse().find((estimate: Repair) => String(estimate.status) === "pending" && !estimate.latest_decision) || null;
  }, [current]);
  const replyTarget = useMemo(() => {
    if (!current || !Array.isArray(current.communications)) return null;
    return [...current.communications].reverse().find((item: Repair) => Number(item.requires_response) === 1 && !item.responded_at) || null;
  }, [current]);

  async function decide(decision: "approved" | "rejected") {
    if (!current || !pendingEstimate || actionState.busy) return;
    setActionState({ busy: true });
    try {
      await submitRepairAction({ action: "estimate_decision", work_order_id: current.work_order_id, estimate_revision_id: pendingEstimate.id, decision, notes: decisionNotes });
      setDecisionNotes("");
      setActionState({ busy: false, notice: decision === "approved" ? "Estimate approved and recorded with Total Tools." : "Estimate declined and recorded with Total Tools." });
      await load(true);
    } catch (error) { setActionState({ busy: false, error: error instanceof Error ? error.message : "Your estimate decision could not be recorded." }); }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current || !message.trim() || actionState.busy) return;
    setActionState({ busy: true });
    try {
      await submitRepairAction({ action: "message", work_order_id: current.work_order_id, message: message.trim(), ...(replyTarget ? { responds_to_communication_id: replyTarget.id } : {}) });
      setMessage("");
      setActionState({ busy: false, notice: "Your message was sent to the Total Tools repair team." });
      await load(true);
    } catch (error) { setActionState({ busy: false, error: error instanceof Error ? error.message : "Your message could not be sent." }); }
  }

  if (state.loading) return <div className="sc-account-repairs-state"><Clock3 size={22}/><strong>Syncing your repair history…</strong><span>SmartCommerce is importing the latest customer-visible Total Tools service records linked to your account.</span></div>;
  if (state.error) return <div className="sc-account-repairs-state is-error"><AlertCircle size={22}/><strong>Repair information unavailable</strong><span>{state.error}</span><button onClick={() => void load()}><RefreshCw size={15}/>Try again</button></div>;
  if (!state.data?.linked) return <div className="sc-account-repairs-state"><Wrench size={22}/><strong>No linked service record yet</strong><span>{state.data?.message || "When your verified SmartCommerce account matches your Total Tools service profile, repairs will appear here automatically."}</span></div>;

  return <div className="sc-account-repairs">
    {state.data.syncWarning ? <div className="sc-account-repairs__warning"><AlertCircle size={15}/>{state.data.syncWarning}</div> : null}
    {actionState.notice ? <div className="sc-account-repairs__action-notice"><CheckCircle2 size={16}/>{actionState.notice}</div> : null}
    {actionState.error ? <div className="sc-account-repairs__action-error"><AlertCircle size={16}/>{actionState.error}</div> : null}
    <div className="sc-account-repairs__metrics">
      <article><span>Active repairs</span><strong>{active}</strong></article>
      <article><span>Completed / pickup</span><strong>{completed}</strong></article>
      <article><span>Waiting on you</span><strong>{awaitingResponse}</strong></article>
    </div>
    <div className="sc-account-repairs__layout">
      <div className="sc-account-repairs__list">
        {repairs.length ? repairs.map((repair) => <button key={repair.work_order_id} type="button" className={String(current?.work_order_id) === String(repair.work_order_id) ? "is-active" : ""} onClick={() => { setSelected(String(repair.work_order_id)); setActionState({ busy: false }); setDecisionNotes(""); setMessage(""); }}>
          <div><span>{repair.wo_number || `Repair ${repair.work_order_id}`}</span><strong>{repair.item_label || "Service repair"}</strong><small>{repair.branch_name || "Total Tools"}</small></div>
          <div><em>{label(repair.status)}</em>{Number(repair.awaiting_customer_response_count || 0) > 0 ? <small>Response needed</small> : null}</div>
        </button>) : <div className="sc-account-repairs-state"><Wrench size={20}/><strong>No repairs found</strong><span>Your linked Total Tools service history is currently empty.</span></div>}
      </div>
      {current ? <section className="sc-account-repair-detail">
        <header><div><span>{current.wo_number || "Repair"}</span><h3>{current.item_label || "Service repair"}</h3><p>{current.description || current.equipment?.reported_issue || "No service description was provided."}</p></div><em>{label(current.status)}</em></header>
        {current.equipment ? <section className="sc-account-repair-detail__section"><div className="sc-account-repair-detail__section-title"><Wrench size={17}/><div><span>Equipment</span><strong>{[current.equipment.brand,current.equipment.model].filter(Boolean).join(" ") || current.equipment.type || "Customer equipment"}</strong></div></div><dl><div><dt>Serial</dt><dd>{current.equipment.serial_number || "Not recorded"}</dd></div><div><dt>Warranty</dt><dd>{label(current.equipment.warranty_status || "not set")}</dd></div><div><dt>Reported issue</dt><dd>{current.equipment.reported_issue || "—"}</dd></div><div><dt>Warranty claim</dt><dd>{current.equipment.warranty_claim ? "Yes" : "No"}</dd></div></dl></section> : null}
        <dl><div><dt>Branch</dt><dd>{current.branch_name || "—"}</dd></div><div><dt>Service advisor</dt><dd>{current.employee_name || "—"}</dd></div><div><dt>Assessment fee</dt><dd>{money(current.assessment_fee)}</dd></div><div><dt>Estimated labor</dt><dd>{money(current.estimate_labor)}</dd></div><div><dt>Consumables</dt><dd>{money(current.estimate_consumables)}</dd></div><div><dt>Parts</dt><dd>{money(current.parts_total)}</dd></div><div><dt>Deposit</dt><dd>{money(current.deposit_amount)}</dd></div><div><dt>Pickup due</dt><dd>{current.pickup_due_date || "Not set"}</dd></div></dl>
        {pendingEstimate ? <section className="sc-account-repair-decision"><div><span>Approval needed</span><h4>Estimate revision {pendingEstimate.revision_number}</h4><p>{pendingEstimate.reason || "Review the latest repair estimate before work proceeds."}</p><strong>{money(pendingEstimate.total_amount)}</strong></div><label>Optional note<textarea value={decisionNotes} maxLength={2000} rows={3} onChange={(event) => setDecisionNotes(event.target.value)} placeholder="Add a note for the repair team" /></label><div className="sc-account-repair-decision__actions"><button type="button" disabled={actionState.busy} onClick={() => void decide("approved")}><CheckCircle2 size={17}/>Approve estimate</button><button type="button" className="is-danger" disabled={actionState.busy} onClick={() => void decide("rejected")}><XCircle size={17}/>Decline estimate</button></div><small>Your decision is written back to the Total Tools repair record with a portal audit trail.</small></section> : null}
        {Array.isArray(current.estimates) && current.estimates.length ? <section className="sc-account-repair-detail__section"><div className="sc-account-repair-detail__section-title"><ShieldCheck size={17}/><div><span>Authorizations</span><strong>Estimate history</strong></div></div><div className="sc-account-repair-events">{current.estimates.map((estimate: Repair) => <article key={estimate.id}><div><strong>Revision {estimate.revision_number}</strong><span>{estimate.reason || "Repair estimate"}</span></div><div><b>{money(estimate.total_amount)}</b><em>{label(estimate.latest_decision || estimate.status)}</em></div></article>)}</div></section> : null}
        {Array.isArray(current.diagnostics) && current.diagnostics.length ? <section className="sc-account-repair-detail__section"><div className="sc-account-repair-detail__section-title"><Wrench size={17}/><div><span>Diagnostics</span><strong>Customer-visible findings</strong></div></div><div className="sc-account-repair-events">{current.diagnostics.map((item: Repair) => <article key={item.id}><div><strong>{item.fault_code ? `Fault ${item.fault_code}` : "Diagnostic update"}</strong><span>{item.findings}</span>{item.recommended_action ? <small>{item.recommended_action}</small> : null}</div><time>{dateTime(item.created_at)}</time></article>)}</div></section> : null}
        {Array.isArray(current.timeline) && current.timeline.length ? <section className="sc-account-repair-detail__section"><div className="sc-account-repair-detail__section-title"><Clock3 size={17}/><div><span>Repair timeline</span><strong>What has happened</strong></div></div><div className="sc-account-repair-timeline">{current.timeline.map((event: Repair) => <article key={event.id}><i/><div><strong>{event.title}</strong><span>{event.details || label(event.event_type)}</span><time>{dateTime(event.created_at)}</time></div></article>)}</div></section> : null}
        {Array.isArray(current.communications) && current.communications.length ? <section className="sc-account-repair-detail__section"><div className="sc-account-repair-detail__section-title"><MessageCircle size={17}/><div><span>Messages & updates</span><strong>Customer-visible communication</strong></div></div><div className="sc-account-repair-events">{current.communications.map((item: Repair) => <article key={item.id}><div><strong>{item.subject || label(item.message_type)}</strong><span>{item.body}</span></div><div><em>{label(item.channel)}</em><time>{dateTime(item.created_at)}</time></div></article>)}</div></section> : null}
        <form className="sc-account-repair-reply" onSubmit={sendMessage}><div><MessageCircle size={18}/><div><span>{replyTarget ? "Response requested" : "Message the repair team"}</span><strong>{replyTarget ? (replyTarget.subject || "Reply to Total Tools") : "Send a secure portal message"}</strong></div></div>{replyTarget ? <blockquote>{replyTarget.body}</blockquote> : null}<label>Your message<textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={4000} rows={4} placeholder="Write your message to the Total Tools repair team" required /></label><button type="submit" disabled={actionState.busy || !message.trim()}><Send size={16}/>{actionState.busy ? "Sending…" : "Send message"}</button><small>Messages are recorded on this repair and remain visible in your SmartCommerce account.</small></form>
        <footer><span>Last synchronized</span><strong>{current.synced_at ? new Date(current.synced_at).toLocaleString() : "Recently"}</strong></footer>
      </section> : <div className="sc-account-repairs-state"><Wrench size={22}/><strong>Select a repair</strong><span>Choose a service record to view its imported status and service details.</span></div>}
    </div>
  </div>;
}
