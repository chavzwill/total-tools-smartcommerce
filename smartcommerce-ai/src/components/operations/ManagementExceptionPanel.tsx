import { AlertTriangle, BellRing, CheckCircle2, Clock3, Download, PauseCircle, Printer, RefreshCw, ShieldAlert, UserCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import "../../styles/management-exceptions.css";

type Row = Record<string, any>;
const titleCase = (value: unknown) => String(value || "—").replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
const date = (value: unknown) => value ? new Intl.DateTimeFormat("en-JM", { dateStyle: "medium", timeStyle: "short" }).format(new Date(String(value))) : "—";
const csv = (value: unknown) => { const text = value == null ? "" : String(value); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };

async function load() {
  const response = await fetch("/api/omnichannel-exceptions?refresh=1&limit=200", { credentials: "same-origin", headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || "Management exceptions are unavailable.");
  return payload?.data || { summary: {}, notifications: [], active: [] };
}
async function mutate(exceptionId: string, action: string, extra: Row = {}) {
  const response = await fetch("/api/omnichannel-exceptions", { method: "PATCH", credentials: "same-origin", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ exceptionId, action, ...extra }) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || "The exception could not be updated.");
  return payload?.data || null;
}

export default function ManagementExceptionPanel({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<Row>({ summary: {}, notifications: [], active: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [working, setWorking] = useState("");
  async function refresh() { setLoading(true); setError(""); try { setData(await load()); } catch (e) { setError((e as Error).message); } finally { setLoading(false); } }
  useEffect(() => { void refresh(); }, []);
  const rows = Array.isArray(data.active) ? data.active as Row[] : [];
  const visible = useMemo(() => compact ? rows.slice(0, 8) : rows, [rows, compact]);
  const summary = data.summary || {};

  async function act(row: Row, action: "claim" | "acknowledge" | "snooze" | "resolve") {
    if (working) return;
    const id = String(row.exception_id || "");
    if (!id) return;
    let extra: Row = {};
    if (action === "snooze") {
      const raw = window.prompt("Snooze for how many hours?", "4");
      if (raw === null) return;
      const hours = Math.max(1, Math.min(168, Math.trunc(Number(raw) || 4)));
      extra = { snoozeHours: hours };
    }
    if (action === "resolve") {
      const note = window.prompt("Resolution note (required):", "");
      if (note === null || !note.trim()) return;
      extra = { note: note.trim() };
    }
    setWorking(id); setError("");
    try { await mutate(id, action, extra); await refresh(); }
    catch (e) { setError((e as Error).message); }
    finally { setWorking(""); }
  }

  function exportCsv() {
    const headers = ["Severity", "Escalation", "State", "Owner", "Category", "Exception", "Reason", "Source", "Record", "POS reference", "Status", "Age hours", "Detected"];
    const body = rows.map((row) => { const ex = row.exception || {}; return [row.severity, row.escalation_level, row.state, row.owner_employee_id, row.category, row.title, ex.reason, row.source_channel, row.item_type, row.reference, ex.status, ex.ageHours, ex.occurredAt].map(csv).join(","); });
    const blob = new Blob([[headers.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `total-tools-management-exceptions-${new Date().toISOString().slice(0,10)}.csv`; document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section className={`sc-management-exceptions${compact ? " is-compact" : ""}`} data-guide-id="management-exceptions">
    <header><div><span>Exception management</span><h2>{compact ? "Items needing attention" : "Cross-channel Management Exceptions"}</h2><p>{compact ? "Owned, acknowledged and escalated operational exceptions." : "Evidence-backed exceptions with ownership, acknowledgement, snooze, escalation and resolution history."}</p></div><div className="sc-management-exceptions__actions">{!compact ? <><button type="button" className="sc-button sc-button--secondary" onClick={exportCsv} disabled={!rows.length}><Download size={15}/>CSV</button><button type="button" className="sc-button sc-button--secondary" onClick={() => window.print()}><Printer size={15}/>Print / PDF</button></> : null}<button type="button" className="sc-button sc-button--secondary" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15}/>Refresh</button></div></header>
    {error ? <div className="sc-management-exceptions__error"><AlertTriangle size={15}/>{error}</div> : null}
    <div className="sc-management-exceptions__metrics"><article><ShieldAlert size={17}/><span>Critical</span><strong>{Number(summary.critical || 0)}</strong></article><article><AlertTriangle size={17}/><span>High</span><strong>{Number(summary.high || 0)}</strong></article><article><UserCheck size={17}/><span>Unassigned</span><strong>{Number(summary.unassigned || 0)}</strong></article><article><BellRing size={17}/><span>Escalated</span><strong>{Number(summary.escalated || 0)}</strong></article></div>
    {loading ? <div className="sc-management-exceptions__empty">Checking authoritative outcomes…</div> : !visible.length ? <div className="sc-management-exceptions__empty"><ShieldAlert size={22}/><strong>No active cross-channel exceptions.</strong><span>Snoozed items stay hidden until their wake time; resolved items remain in notification history.</span></div> : <div className="sc-management-exceptions__table"><table><thead><tr><th>Severity</th><th>Exception</th><th>Owner / state</th><th>Source</th><th>POS ref</th><th>Age</th><th>Actions</th></tr></thead><tbody>{visible.map((row) => { const ex = row.exception || {}; const id = String(row.exception_id); return <tr key={id}><td><em data-severity={String(row.severity)}>{titleCase(row.severity)}</em><small>Esc. L{Number(row.escalation_level || 0)}</small></td><td><strong>{row.title}</strong><small>{ex.reason || "—"}</small></td><td><strong>{row.owner_employee_id || "Unassigned"}</strong><small>{titleCase(row.state)}</small></td><td>{titleCase(row.source_channel)}<small>{titleCase(row.item_type)}</small></td><td>{row.reference || "—"}<small>{titleCase(ex.status)}</small></td><td>{Number(ex.ageHours || 0).toFixed(1)}h<small>{date(ex.occurredAt)}</small></td><td><div className="sc-management-exceptions__row-actions">{!row.owner_employee_id ? <button type="button" disabled={working === id} onClick={() => void act(row, "claim")}><UserCheck size={13}/>Claim</button> : null}{row.state !== "acknowledged" ? <button type="button" disabled={working === id} onClick={() => void act(row, "acknowledge")}><CheckCircle2 size={13}/>Acknowledge</button> : null}<button type="button" disabled={working === id} onClick={() => void act(row, "snooze")}><PauseCircle size={13}/>Snooze</button><button type="button" disabled={working === id} onClick={() => void act(row, "resolve")}><CheckCircle2 size={13}/>Resolve</button></div></td></tr>; })}</tbody></table></div>}
  </section>;
}
