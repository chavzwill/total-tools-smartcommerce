import { Banknote, CheckCircle2, CircleDollarSign, Loader2, RefreshCw, ShieldCheck, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { operationsRequest, type OperationsApiError, type StaffIdentity } from "../../lib/staffOperations";
import "../../styles/cash-drawer-lifecycle.css";

type Row = Record<string, any>;
type Session = Row & { id: string | number; status?: string; drawer_name?: string; branch_name?: string; opening_float?: number; tenders?: Row[]; reconciliation?: Row | null };
type Denomination = Row & { id: string | number; value: number; label: string; currency?: string };

const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const money = (value: number) => new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", maximumFractionDigits: 2 }).format(value || 0);
const methods = ["cash", "card", "check", "gift_card", "credit", "direct_deposit"] as const;
const labels: Record<string, string> = { cash: "Cash", card: "Card", check: "Cheque", gift_card: "Gift card", credit: "Charge account", direct_deposit: "Direct deposit" };

export default function CashDrawerLifecyclePanel({ staff }: { staff: StaffIdentity }) {
  const [session, setSession] = useState<Session | null>(null);
  const [denominations, setDenominations] = useState<Denomination[]>([]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const cashFromNotes = useMemo(() => denominations.reduce((sum, d) => sum + n(d.value) * Math.max(0, Math.floor(n(counts[String(d.id)]))), 0), [denominations, counts]);
  const expected = useMemo(() => {
    const out: Record<string, number> = {};
    for (const method of methods) out[method] = 0;
    for (const row of session?.tenders || []) out[String(row.payment_method || "")] = n(row.total);
    return out;
  }, [session]);
  const cashCounted = denominations.length ? cashFromNotes : n(counted.cash);
  const expectedCashInDrawer = n(session?.opening_float) + n(expected.cash);
  const cashVariance = cashCounted - expectedCashInDrawer;

  async function load() {
    setLoading(true); setError("");
    try {
      const sessions = await operationsRequest<Session[]>(`drawers/sessions?employee_id=${encodeURIComponent(staff.employeeId)}&status=open`);
      const active = Array.isArray(sessions) && sessions.length ? sessions[0] : null;
      if (!active) { setSession(null); setOpen(false); return; }
      const detail = await operationsRequest<Session>(`drawers/sessions/${encodeURIComponent(String(active.id))}`);
      setSession({ ...active, ...detail });
    } catch (cause) { setError((cause as OperationsApiError).message || "Drawer session could not be loaded."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [staff.employeeId]);

  async function beginReconciliation() {
    if (!session) return;
    setLoading(true); setError(""); setMessage("");
    try {
      const [detail, denoms] = await Promise.all([
        operationsRequest<Session>(`drawers/sessions/${encodeURIComponent(String(session.id))}`),
        operationsRequest<Denomination[]>("denominations?currency=JMD"),
      ]);
      const merged = { ...session, ...detail };
      setSession(merged);
      setDenominations((Array.isArray(denoms) ? denoms : []).filter((row) => n(row.value) > 0));
      const initial: Record<string, string> = {};
      for (const method of methods) initial[method] = method === "cash" ? "" : String(n((merged.tenders || []).find((r) => String(r.payment_method) === method)?.total));
      setCounted(initial); setCounts({}); setNotes(""); setOpen(true);
    } catch (cause) { setError((cause as OperationsApiError).message || "Drawer reconciliation could not be prepared."); }
    finally { setLoading(false); }
  }

  async function reconcile() {
    if (!session || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const note_counts = denominations.map((d) => ({ denomination_id: d.id, quantity: Math.max(0, Math.floor(n(counts[String(d.id)]))) })).filter((r) => r.quantity > 0);
      await operationsRequest(`drawers/sessions/${encodeURIComponent(String(session.id))}/reconcile`, {
        method: "POST",
        body: JSON.stringify({
          cash_counted: cashCounted,
          card_counted: n(counted.card),
          check_counted: n(counted.check),
          gift_card_counted: n(counted.gift_card),
          credit_counted: n(counted.credit),
          direct_deposit_counted: n(counted.direct_deposit),
          notes: notes || null,
          reconciled_by: staff.employeeId,
          note_counts,
        }),
      });
      setOpen(false); setSession(null); setMessage("Drawer reconciled and closed successfully.");
    } catch (cause) { setError((cause as OperationsApiError).message || "Drawer reconciliation failed."); }
    finally { setBusy(false); }
  }

  return <section className="sc-drawer-panel" data-guide-id="drawer-reconciliation">
    <div className="sc-drawer-panel__head">
      <div><CircleDollarSign size={19}/><div><strong>Cash drawer & shift close</strong><span>Count, reconcile and close the active cashier session.</span></div></div>
      <button type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/>{loading ? "Refreshing…" : "Refresh"}</button>
    </div>
    {error ? <div className="sc-drawer-panel__alert is-error">{error}</div> : null}
    {message ? <div className="sc-drawer-panel__alert is-success"><CheckCircle2 size={16}/>{message}</div> : null}
    {loading && !session ? <div className="sc-drawer-panel__empty"><Loader2 className="sc-ops-spin" size={20}/>Checking active drawer…</div> : session ? <div className="sc-drawer-panel__summary">
      <div><span>Drawer</span><strong>{session.drawer_name || `Session ${session.id}`}</strong></div>
      <div><span>Opening float</span><strong>{money(n(session.opening_float))}</strong></div>
      <div><span>Transactions</span><strong>{n(session.tx_count)}</strong></div>
      <div><span>Sales total</span><strong>{money(n(session.tx_total))}</strong></div>
      <button type="button" className="sc-button sc-button--primary" onClick={() => void beginReconciliation()}><Banknote size={16}/>Count & close drawer</button>
    </div> : <div className="sc-drawer-panel__empty"><ShieldCheck size={18}/>No open drawer session for this cashier.</div>}

    {open && session ? <div className="sc-drawer-modal" role="dialog" aria-modal="true" aria-label="Reconcile cash drawer">
      <div className="sc-drawer-modal__card">
        <div className="sc-drawer-modal__head"><div><strong>Reconcile {session.drawer_name || `drawer ${session.id}`}</strong><span>Count physical cash and confirm non-cash tender totals.</span></div><button onClick={() => setOpen(false)} aria-label="Close"><X size={18}/></button></div>
        <div className="sc-drawer-expected">
          {methods.map((method) => <div key={method}><span>{labels[method]} expected</span><strong>{money(method === "cash" ? expectedCashInDrawer : n(expected[method]))}</strong></div>)}
        </div>
        {denominations.length ? <div className="sc-drawer-denoms"><h4>Cash denomination count</h4>{denominations.map((d) => <label key={String(d.id)}><span>{d.label || money(n(d.value))}</span><input inputMode="numeric" min="0" type="number" value={counts[String(d.id)] || ""} onChange={(e) => setCounts((v) => ({ ...v, [String(d.id)]: e.target.value }))}/><strong>{money(n(d.value) * Math.max(0, Math.floor(n(counts[String(d.id)]))))}</strong></label>)}<div className="sc-drawer-cash-total"><span>Physical cash counted</span><strong>{money(cashCounted)}</strong><small className={Math.abs(cashVariance) < .01 ? "is-ok" : "is-var"}>Variance {money(cashVariance)}</small></div></div> : <label className="sc-drawer-field"><span>Cash counted</span><input type="number" min="0" step="0.01" value={counted.cash || ""} onChange={(e) => setCounted((v) => ({ ...v, cash: e.target.value }))}/></label>}
        <div className="sc-drawer-noncash">{methods.filter((m) => m !== "cash").map((method) => <label key={method}><span>{labels[method]} counted</span><input type="number" min="0" step="0.01" value={counted[method] || ""} onChange={(e) => setCounted((v) => ({ ...v, [method]: e.target.value }))}/><small>Expected {money(n(expected[method]))}</small></label>)}</div>
        <label className="sc-drawer-field"><span>Reconciliation notes</span><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Explain shortages, overages or unusual tender activity"/></label>
        <div className="sc-drawer-modal__actions"><button className="sc-button sc-button--secondary" onClick={() => setOpen(false)}>Cancel</button><button className="sc-button sc-button--primary" onClick={() => void reconcile()} disabled={busy}>{busy ? <Loader2 className="sc-ops-spin" size={16}/> : <CheckCircle2 size={16}/>}Reconcile & close</button></div>
      </div>
    </div> : null}
  </section>;
}
