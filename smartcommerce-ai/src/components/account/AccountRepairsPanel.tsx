import { AlertCircle, Clock3, MessageCircle, RefreshCw, ShieldCheck, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

export default function AccountRepairsPanel() {
  const [state, setState] = useState<{ loading: boolean; data?: RepairsResponse; error?: string }>({ loading: true });
  const [selected, setSelected] = useState<string | null>(null);

  async function load() {
    setState((current) => ({ ...current, loading: true, error: undefined }));
    try {
      const data = await loadRepairs();
      setState({ loading: false, data });
      if (!selected && data.repairs?.[0]?.work_order_id != null) setSelected(String(data.repairs[0].work_order_id));
    } catch (error) {
      setState({ loading: false, error: error instanceof Error ? error.message : "Repair information could not be loaded." });
    }
  }

  useEffect(() => { void load(); }, []);

  const repairs = state.data?.repairs || [];
  const active = useMemo(() => repairs.filter((repair) => !["picked_up", "cancelled"].includes(String(repair.status))).length, [repairs]);
  const completed = useMemo(() => repairs.filter((repair) => ["complete", "awaiting_pickup", "picked_up"].includes(String(repair.status))).length, [repairs]);
  const awaitingResponse = useMemo(() => repairs.reduce((sum, repair) => sum + Number(repair.awaiting_customer_response_count || 0), 0), [repairs]);
  const current = selected ? repairs.find((repair) => String(repair.work_order_id) === selected) : repairs[0];

  if (state.loading) return <div className="sc-account-repairs-state"><Clock3 size={22}/><strong>Syncing your repair history…</strong><span>SmartCommerce is importing the latest customer-visible Total Tools service records linked to your account.</span></div>;
  if (state.error) return <div className="sc-account-repairs-state is-error"><AlertCircle size={22}/><strong>Repair information unavailable</strong><span>{state.error}</span><button onClick={() => void load()}><RefreshCw size={15}/>Try again</button></div>;
  if (!state.data?.linked) return <div className="sc-account-repairs-state"><Wrench size={22}/><strong>No linked service record yet</strong><span>{state.data?.message || "When your verified SmartCommerce account matches your Total Tools service profile, repairs will appear here automatically."}</span></div>;

  return <div className="sc-account-repairs">
    {state.data.syncWarning ? <div className="sc-account-repairs__warning"><AlertCircle size={15}/>{state.data.syncWarning}</div> : null}
    <div className="sc-account-repairs__metrics">
      <article><span>Active repairs</span><strong>{active}</strong></article>
      <article><span>Completed / pickup</span><strong>{completed}</strong></article>
      <article><span>Waiting on you</span><strong>{awaitingResponse}</strong></article>
    </div>

    <div className="sc-account-repairs__layout">
      <div className="sc-account-repairs__list">
        {repairs.length ? repairs.map((repair) => <button key={repair.work_order_id} type="button" className={String(current?.work_order_id) === String(repair.work_order_id) ? "is-active" : ""} onClick={() => setSelected(String(repair.work_order_id))}>
          <div><span>{repair.wo_number || `Repair ${repair.work_order_id}`}</span><strong>{repair.item_label || "Service repair"}</strong><small>{repair.branch_name || "Total Tools"}</small></div>
          <div><em>{label(repair.status)}</em>{Number(repair.awaiting_customer_response_count || 0) > 0 ? <small>Response needed</small> : null}</div>
        </button>) : <div className="sc-account-repairs-state"><Wrench size={20}/><strong>No repairs found</strong><span>Your linked Total Tools service history is currently empty.</span></div>}
      </div>

      {current ? <section className="sc-account-repair-detail">
        <header><div><span>{current.wo_number || "Repair"}</span><h3>{current.item_label || "Service repair"}</h3><p>{current.description || current.equipment?.reported_issue || "No service description was provided."}</p></div><em>{label(current.status)}</em></header>

        {current.equipment ? <section className="sc-account-repair-detail__section"><div className="sc-account-repair-detail__section-title"><Wrench size={17}/><div><span>Equipment</span><strong>{[current.equipment.brand,current.equipment.model].filter(Boolean).join(" ") || current.equipment.type || "Customer equipment"}</strong></div></div><dl><div><dt>Serial</dt><dd>{current.equipment.serial_number || "Not recorded"}</dd></div><div><dt>Warranty</dt><dd>{label(current.equipment.warranty_status || "not set")}</dd></div><div><dt>Reported issue</dt><dd>{current.equipment.reported_issue || "—"}</dd></div><div><dt>Warranty claim</dt><dd>{current.equipment.warranty_claim ? "Yes" : "No"}</dd></div></dl></section> : null}

        <dl>
          <div><dt>Branch</dt><dd>{current.branch_name || "—"}</dd></div>
          <div><dt>Service advisor</dt><dd>{current.employee_name || "—"}</dd></div>
          <div><dt>Assessment fee</dt><dd>{money(current.assessment_fee)}</dd></div>
          <div><dt>Estimated labor</dt><dd>{money(current.estimate_labor)}</dd></div>
          <div><dt>Consumables</dt><dd>{money(current.estimate_consumables)}</dd></div>
          <div><dt>Parts</dt><dd>{money(current.parts_total)}</dd></div>
          <div><dt>Deposit</dt><dd>{money(current.deposit_amount)}</dd></div>
          <div><dt>Pickup due</dt><dd>{current.pickup_due_date || "Not set"}</dd></div>
        </dl>

        {Array.isArray(current.estimates) && current.estimates.length ? <section className="sc-account-repair-detail__section"><div className="sc-account-repair-detail__section-title"><ShieldCheck size={17}/><div><span>Authorizations</span><strong>Estimate history</strong></div></div><div className="sc-account-repair-events">{current.estimates.map((estimate: Repair) => <article key={estimate.id}><div><strong>Revision {estimate.revision_number}</strong><span>{estimate.reason || "Repair estimate"}</span></div><div><b>{money(estimate.total_amount)}</b><em>{label(estimate.latest_decision || estimate.status)}</em></div></article>)}</div></section> : null}

        {Array.isArray(current.diagnostics) && current.diagnostics.length ? <section className="sc-account-repair-detail__section"><div className="sc-account-repair-detail__section-title"><Wrench size={17}/><div><span>Diagnostics</span><strong>Customer-visible findings</strong></div></div><div className="sc-account-repair-events">{current.diagnostics.map((item: Repair) => <article key={item.id}><div><strong>{item.fault_code ? `Fault ${item.fault_code}` : "Diagnostic update"}</strong><span>{item.findings}</span>{item.recommended_action ? <small>{item.recommended_action}</small> : null}</div><time>{dateTime(item.created_at)}</time></article>)}</div></section> : null}

        {Array.isArray(current.timeline) && current.timeline.length ? <section className="sc-account-repair-detail__section"><div className="sc-account-repair-detail__section-title"><Clock3 size={17}/><div><span>Repair timeline</span><strong>What has happened</strong></div></div><div className="sc-account-repair-timeline">{current.timeline.map((event: Repair) => <article key={event.id}><i/><div><strong>{event.title}</strong><span>{event.details || label(event.event_type)}</span><time>{dateTime(event.created_at)}</time></div></article>)}</div></section> : null}

        {Array.isArray(current.communications) && current.communications.length ? <section className="sc-account-repair-detail__section"><div className="sc-account-repair-detail__section-title"><MessageCircle size={17}/><div><span>Messages & updates</span><strong>Customer-visible communication</strong></div></div><div className="sc-account-repair-events">{current.communications.map((message: Repair) => <article key={message.id}><div><strong>{message.subject || label(message.message_type)}</strong><span>{message.body}</span></div><div><em>{label(message.channel)}</em><time>{dateTime(message.created_at)}</time></div></article>)}</div></section> : null}

        <footer><span>Last synchronized</span><strong>{current.synced_at ? new Date(current.synced_at).toLocaleString() : "Recently"}</strong></footer>
      </section> : <div className="sc-account-repairs-state"><Wrench size={22}/><strong>Select a repair</strong><span>Choose a service record to view its imported status and service details.</span></div>}
    </div>
  </div>;
}
