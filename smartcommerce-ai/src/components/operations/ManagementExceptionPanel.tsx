import { AlertTriangle, Clock3, RefreshCw, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import "../../styles/management-exceptions.css";

type Row = Record<string, any>;
const titleCase = (value: unknown) => String(value || "—").replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
const date = (value: unknown) => value ? new Intl.DateTimeFormat("en-JM", { dateStyle: "medium", timeStyle: "short" }).format(new Date(String(value))) : "—";

async function load() {
  const response = await fetch("/api/omnichannel-exceptions?refresh=1&limit=200", { credentials: "same-origin", headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || "Management exceptions are unavailable.");
  return payload?.data || { summary: {}, exceptions: [] };
}

export default function ManagementExceptionPanel({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<Row>({ summary: {}, exceptions: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function refresh() { setLoading(true); setError(""); try { setData(await load()); } catch (e) { setError((e as Error).message); } finally { setLoading(false); } }
  useEffect(() => { void refresh(); }, []);
  const rows = Array.isArray(data.exceptions) ? data.exceptions as Row[] : [];
  const visible = useMemo(() => compact ? rows.slice(0, 8) : rows, [rows, compact]);
  const summary = data.summary || {};

  return <section className={`sc-management-exceptions${compact ? " is-compact" : ""}`} data-guide-id="management-exceptions">
    <header><div><span>Exception management</span><h2>{compact ? "Items needing attention" : "Cross-channel Management Exceptions"}</h2><p>{compact ? "SLA breaches, failures and overdue connected work." : "Evidence-backed exceptions across website, apps, SmartCommerce intake and the authoritative POS lifecycle."}</p></div><button type="button" className="sc-button sc-button--secondary" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15}/>Refresh</button></header>
    {error ? <div className="sc-management-exceptions__error"><AlertTriangle size={15}/>{error}</div> : null}
    <div className="sc-management-exceptions__metrics"><article><ShieldAlert size={17}/><span>Critical</span><strong>{Number(summary.critical || 0)}</strong></article><article><AlertTriangle size={17}/><span>High</span><strong>{Number(summary.high || 0)}</strong></article><article><Clock3 size={17}/><span>Medium</span><strong>{Number(summary.medium || 0)}</strong></article><article><span>Total open</span><strong>{Number(summary.total || 0)}</strong></article></div>
    {loading ? <div className="sc-management-exceptions__empty">Checking authoritative outcomes…</div> : !visible.length ? <div className="sc-management-exceptions__empty"><ShieldAlert size={22}/><strong>No current cross-channel exceptions.</strong><span>New SLA breaches or failed synchronized workflows will appear here.</span></div> : <div className="sc-management-exceptions__table"><table><thead><tr><th>Severity</th><th>Exception</th><th>Source</th><th>Record</th><th>POS ref</th><th>Status</th><th>Age</th><th>Detected</th></tr></thead><tbody>{visible.map((row) => <tr key={String(row.id)}><td><em data-severity={String(row.severity)}>{titleCase(row.severity)}</em></td><td><strong>{row.title}</strong><small>{row.reason}</small></td><td>{titleCase(row.sourceChannel)}</td><td>{titleCase(row.itemType)}</td><td>{row.reference || "—"}</td><td>{titleCase(row.status)}</td><td>{Number(row.ageHours || 0).toFixed(1)}h</td><td>{date(row.occurredAt)}</td></tr>)}</tbody></table></div>}
  </section>;
}
