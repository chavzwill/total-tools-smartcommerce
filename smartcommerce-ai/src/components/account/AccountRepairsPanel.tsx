import { AlertCircle, CheckCircle2, Clock3, RefreshCw, ShieldCheck, Wrench, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import "../../styles/accountRepairs.css";

type Repair = Record<string, any>;
type Response = { linked: boolean; repairs: Repair[]; message?: string; syncWarning?: string; error?: { message?: string } };

const money = (value: unknown) => new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", maximumFractionDigits: 2 }).format(Number(value || 0));
const label = (value: unknown) => String(value || "—").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

async function request(input?: RequestInit): Promise<Response> {
  const response = await fetch("/api/customer-repairs", { credentials: "same-origin", ...input, headers: { Accept: "application/json", ...(input?.body ? { "Content-Type": "application/json" } : {}), ...(input?.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || "Repair information could not be loaded.");
  return payload;
}

export default function AccountRepairsPanel() {
  const [state, setState] = useState<{ loading: boolean; data?: Response; error?: string }>({ loading: true });
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function load() {
    setState((current) => ({ ...current, loading: true, error: undefined }));
    try { setState({ loading: false, data: await request() }); }
    catch (error) { setState({ loading: false, error: error instanceof Error ? error.message : "Repair information could not be loaded." }); }
  }

  useEffect(() => { void load(); }, []);
  const repairs = state.data?.repairs || [];
  const active = useMemo(() => repairs.filter((repair) => !["picked_up", "cancelled"].includes(String(repair.status))).length, [repairs]);
  const pending = useMemo(() => repairs.filter((repair) => repair.authorization_status === "pending").length, [repairs]);
  const current = selected ? repairs.find((repair) => String(repair.work_order_id) === selected) : undefined;

  async function decide(decision: "approved" | "declined") {
    if (!current?.authorization_id || busy) return;
    setBusy(true);
    try {
      const next = await request({ method: "POST", body: JSON.stringify({ action: "decide_authorization", authorizationId: current.authorization_id, decision, note: note.trim() || null }) });
      setState({ loading: false, data: next }); setNote("");
    } catch (error) { setState((value) => ({ ...value, error: error instanceof Error ? error.message : "Decision could not be recorded." })); }
    finally { setBusy(false); }
  }

  if (state.loading) return <div className="sc-account-repairs-state"><Clock3 size={22}/><strong>Syncing your repair history…</strong><span>SmartCommerce is checking the latest imported Total Tools service records.</span></div>;
  if (state.error) return <div className="sc-account-repairs-state is-error"><AlertCircle size={22}/><strong>Repair information unavailable</strong><span>{state.error}</span><button onClick={() => void load()}><RefreshCw size={15}/>Try again</button></div>;
  if (!state.data?.linked) return <div className="sc-account-repairs-state"><Wrench size={22}/><strong>No linked service record yet</strong><span>{state.data?.message || "When your Total Tools service profile is linked to this verified SmartCommerce account, repairs will appear here automatically."}</span></div>;

  return <div className="sc-account-repairs" data-guide-id="account-repairs">
    {state.data.syncWarning ? <div className="sc-account-repairs__warning"><AlertCircle size={15}/>{state.data.syncWarning}</div> : null}
    <div className="sc-account-repairs__metrics"><article><span>Active repairs</span><strong>{active}</strong></article><article><span>Awaiting your decision</span><strong>{pending}</strong></article><article><span>Service history</span><strong>{repairs.length}</strong></article></div>
    <div className="sc-account-repairs__layout">
      <div className="sc-account-repairs__list">
        {repairs.length ? repairs.map((repair) => <button key={repair.work_order_id} type="button" className={selected === String(repair.work_order_id) ? "is-active" : ""} onClick={() => setSelected(String(repair.work_order_id))}>
          <div><span>{repair.wo_number || `Repair ${repair.work_order_id}`}</span><strong>{repair.item_label || "Service repair"}</strong><small>{repair.branch_name || "Total Tools"}</small></div>
          <div><em className={`is-${String(repair.status)}`}>{label(repair.status)}</em>{repair.authorization_status === "pending" ? <i>Approval needed</i> : null}</div>
        </button>) : <div className="sc-account-repairs-state"><Wrench size={20}/><strong>No repairs found</strong><span>Your linked Total Tools service history is currently empty.</span></div>}
      </div>

      {current ? <section className="sc-account-repair-detail">
        <header><div><span>{current.wo_number || "Repair"}</span><h3>{current.item_label || "Service repair"}</h3><p>{current.description || "No service description was provided."}</p></div><em>{label(current.status)}</em></header>
        <dl>
          <div><dt>Branch</dt><dd>{current.branch_name || "—"}</dd></div><div><dt>Service advisor</dt><dd>{current.employee_name || "—"}</dd></div>
          <div><dt>Assessment fee</dt><dd>{money(current.assessment_fee)}</dd></div><div><dt>Estimated labor</dt><dd>{money(current.estimate_labor)}</dd></div>
          <div><dt>Consumables</dt><dd>{money(current.estimate_consumables)}</dd></div><div><dt>Parts</dt><dd>{money(current.parts_total)}</dd></div>
          <div><dt>Deposit</dt><dd>{money(current.deposit_amount)}</dd></div><div><dt>Pickup due</dt><dd>{current.pickup_due_date || "Not set"}</dd></div>
        </dl>
        {current.authorization_id ? <div className="sc-account-repair-auth">
          <div><ShieldCheck size={18}/><span><strong>Repair authorization · Version {current.authorization_version}</strong><small>{label(current.authorization_status)}</small></span></div>
          <p>{current.authorization_scope || "Review the current repair scope before making a decision."}</p>
          <strong>{money(current.authorization_total)}</strong>
          {current.authorization_status === "pending" ? <><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional note for Total Tools" data-guide-id="account-repair-authorization-note"/><div className="sc-account-repair-auth__actions"><button className="is-approve" disabled={busy} onClick={() => void decide("approved")} data-guide-id="account-repair-approve"><CheckCircle2 size={16}/>Approve repair</button><button className="is-decline" disabled={busy} onClick={() => void decide("declined")}><XCircle size={16}/>Decline</button></div></> : <div className="sc-account-repair-auth__done"><CheckCircle2 size={16}/>{current.authorization_status === "approved" ? "You approved this repair scope." : "Your decision has been recorded."}</div>}
        </div> : null}
      </section> : <div className="sc-account-repairs-state"><Wrench size={22}/><strong>Select a repair</strong><span>Choose a service record to view its imported status, costs and authorization details.</span></div>}
    </div>
  </div>;
}
