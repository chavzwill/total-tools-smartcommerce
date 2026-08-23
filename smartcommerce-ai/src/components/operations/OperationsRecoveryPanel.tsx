import { AlertTriangle, CheckCircle2, RefreshCw, RotateCcw, SearchCheck, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import type { StaffIdentity } from "../../lib/staffOperations";
import "../../styles/operations-recovery.css";

type Row = Record<string, any>;

type ApiPayload = { success: boolean; data?: any; error?: { message?: string } };
async function recoveryRequest(init?: RequestInit) {
  const response = await fetch("/api/operations-recovery", { credentials: "same-origin", ...init, headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(init?.headers || {}) } });
  const payload = await response.json().catch(() => null) as ApiPayload | null;
  if (!response.ok) throw new Error(payload?.error?.message || "Operations recovery is unavailable.");
  return payload;
}

const formatDate = (value: unknown) => value ? new Intl.DateTimeFormat("en-JM", { dateStyle: "medium", timeStyle: "short" }).format(new Date(String(value))) : "—";
const title = (value: unknown) => String(value || "—").replace(/[:/_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

export default function OperationsRecoveryPanel({ staff }: { staff: StaffIdentity }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [inspection, setInspection] = useState<Record<string, any>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [references, setReferences] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true); setError("");
    try { const payload = await recoveryRequest(); setRows(Array.isArray(payload.data) ? payload.data : []); }
    catch (e) { setError((e as Error).message); setRows([]); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function act(row: Row, action: "inspect" | "confirm_committed" | "release_retry") {
    const key = String(row.record_key);
    if (working) return;
    setWorking(key); setError("");
    try {
      const payload = await recoveryRequest({ method: "PATCH", body: JSON.stringify({ action, recordKey: key, note: notes[key] || "", reference: references[key] || "" }) });
      if (action === "inspect") setInspection((current) => ({ ...current, [key]: payload.data }));
      else setRows((current) => current.filter((item) => item.record_key !== key));
    } catch (e) { setError((e as Error).message); }
    finally { setWorking(""); }
  }

  if (!staff.permissions.reports && !staff.permissions.security) return null;
  const canResolve = staff.permissions.security_manage === true || staff.permissions.security === true;

  return <section className="sc-ops-recovery" data-guide-id="operations-recovery">
    <header><div><span>Financial & stock safety</span><h3>Operations Recovery</h3><p>Uncertain writes stay locked until the authoritative POS outcome is verified. Never retry an uncertain sale, receipt, refund, transfer or stock write by guesswork.</p></div><button type="button" className="sc-button sc-button--secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/>{loading ? "Refreshing…" : "Refresh"}</button></header>
    {error ? <div className="sc-ops-recovery__error"><AlertTriangle size={16}/>{error}</div> : null}
    {loading ? <div className="sc-ops-recovery__empty">Checking uncertain Operations writes…</div> : rows.length === 0 ? <div className="sc-ops-recovery__empty"><CheckCircle2 size={22}/><strong>No uncertain Operations writes.</strong><span>No staff mutation currently requires reconciliation.</span></div> : <div className="sc-ops-recovery__list">{rows.map((row) => {
      const key = String(row.record_key); const inspected = inspection[key];
      return <article key={key}><div className="sc-ops-recovery__head"><div><span>{String(row.record_key_short || key.slice(0, 16))}</span><strong>{title(row.operation)}</strong></div><em>Outcome uncertain</em></div>
        <dl><div><dt>Actor</dt><dd>{row.actor_id}</dd></div><div><dt>Last response</dt><dd>{row.response_status || "No confirmed response"}</dd></div><div><dt>Started</dt><dd>{formatDate(row.created_at)}</dd></div><div><dt>Last evidence</dt><dd>{formatDate(row.updated_at)}</dd></div></dl>
        <div className="sc-ops-recovery__actions"><button type="button" className="sc-button sc-button--secondary" disabled={working === key} onClick={() => void act(row, "inspect")}><SearchCheck size={15}/>Check authoritative POS</button></div>
        {inspected ? <div className="sc-ops-recovery__inspection"><ShieldAlert size={16}/><div><strong>{inspected.found ? "Authoritative entity located" : "Automatic proof unavailable"}</strong><p>{inspected.message || (inspected.found ? `POS evidence found at ${inspected.entityPath}. Verify the status below against the intended operation before resolving.` : "This operation must be reconciled manually using the POS reference/history.")}</p>{inspected.snapshot ? <pre>{JSON.stringify(inspected.snapshot, null, 2)}</pre> : null}</div></div> : null}
        {canResolve ? <div className="sc-ops-recovery__resolution"><label>Authoritative POS reference<input value={references[key] || ""} onChange={(e) => setReferences((current) => ({ ...current, [key]: e.target.value }))} maxLength={240} placeholder="Transaction / PO / transfer / quote / work-order reference" /></label><label>Recovery decision note<textarea value={notes[key] || ""} onChange={(e) => setNotes((current) => ({ ...current, [key]: e.target.value }))} maxLength={1200} placeholder="State exactly what was verified in the POS and why this lock can be resolved." /></label><div><button type="button" className="sc-button sc-button--secondary" disabled={working === key || (notes[key] || "").trim().length < 8} onClick={() => void act(row, "release_retry")}><RotateCcw size={15}/>Verified not committed — allow retry</button><button type="button" className="sc-button sc-button--primary" disabled={working === key || (notes[key] || "").trim().length < 8} onClick={() => void act(row, "confirm_committed")}><CheckCircle2 size={15}/>Confirmed committed — keep locked</button></div></div> : <p className="sc-ops-recovery__restricted">Security-management authority is required to release or permanently close a retry lock.</p>}
      </article>;
    })}</div>}
  </section>;
}
