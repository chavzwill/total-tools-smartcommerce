import { AlertCircle, Clock3, RefreshCw, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import "../../styles/accountRepairs.css";

type Repair = Record<string, any>;
type RepairsResponse = { linked: boolean; repairs: Repair[]; message?: string; syncWarning?: string; error?: { message?: string } };

const money = (value: unknown) => new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", maximumFractionDigits: 2 }).format(Number(value || 0));
const label = (value: unknown) => String(value || "—").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

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
  const current = selected ? repairs.find((repair) => String(repair.work_order_id) === selected) : repairs[0];

  if (state.loading) return <div className="sc-account-repairs-state"><Clock3 size={22}/><strong>Syncing your repair history…</strong><span>SmartCommerce is importing the latest Total Tools service records linked to your account.</span></div>;
  if (state.error) return <div className="sc-account-repairs-state is-error"><AlertCircle size={22}/><strong>Repair information unavailable</strong><span>{state.error}</span><button onClick={() => void load()}><RefreshCw size={15}/>Try again</button></div>;
  if (!state.data?.linked) return <div className="sc-account-repairs-state"><Wrench size={22}/><strong>No linked service record yet</strong><span>{state.data?.message || "When your verified SmartCommerce account matches your Total Tools service profile, repairs will appear here automatically."}</span></div>;

  return <div className="sc-account-repairs">
    {state.data.syncWarning ? <div className="sc-account-repairs__warning"><AlertCircle size={15}/>{state.data.syncWarning}</div> : null}
    <div className="sc-account-repairs__metrics">
      <article><span>Active repairs</span><strong>{active}</strong></article>
      <article><span>Completed / pickup</span><strong>{completed}</strong></article>
      <article><span>Service history</span><strong>{repairs.length}</strong></article>
    </div>

    <div className="sc-account-repairs__layout">
      <div className="sc-account-repairs__list">
        {repairs.length ? repairs.map((repair) => <button key={repair.work_order_id} type="button" className={String(current?.work_order_id) === String(repair.work_order_id) ? "is-active" : ""} onClick={() => setSelected(String(repair.work_order_id))}>
          <div><span>{repair.wo_number || `Repair ${repair.work_order_id}`}</span><strong>{repair.item_label || "Service repair"}</strong><small>{repair.branch_name || "Total Tools"}</small></div>
          <div><em>{label(repair.status)}</em></div>
        </button>) : <div className="sc-account-repairs-state"><Wrench size={20}/><strong>No repairs found</strong><span>Your linked Total Tools service history is currently empty.</span></div>}
      </div>

      {current ? <section className="sc-account-repair-detail">
        <header><div><span>{current.wo_number || "Repair"}</span><h3>{current.item_label || "Service repair"}</h3><p>{current.description || "No service description was provided."}</p></div><em>{label(current.status)}</em></header>
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
        <footer><span>Last synchronized</span><strong>{current.synced_at ? new Date(current.synced_at).toLocaleString() : "Recently"}</strong></footer>
      </section> : <div className="sc-account-repairs-state"><Wrench size={22}/><strong>Select a repair</strong><span>Choose a service record to view its imported status and service details.</span></div>}
    </div>
  </div>;
}
