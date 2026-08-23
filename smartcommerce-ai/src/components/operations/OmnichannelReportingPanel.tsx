import { RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ManagementExceptionPanel from "./ManagementExceptionPanel";
import TechnicianCompensationReportingPanel from "./TechnicianCompensationReportingPanel";
import "../../styles/omnichannel-reporting.css";

type Row = Record<string, any>;

const dateOnly = (value: Date) => value.toISOString().slice(0, 10);
const label = (value: unknown) => String(value || "—").replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

async function load(start: string, end: string) {
  const response = await fetch(`/api/omnichannel?view=report&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, { credentials: "same-origin", headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || "Digital channel reporting is unavailable.");
  return payload?.data || {};
}

export default function OmnichannelReportingPanel() {
  const today = new Date();
  const [start, setStart] = useState(dateOnly(new Date(today.getTime() - 29 * 86400000)));
  const [end, setEnd] = useState(dateOnly(today));
  const [data, setData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true); setError("");
    try { setData(await load(start, end)); }
    catch (e) { setError((e as Error).message); setData({}); }
    finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, []);

  const byChannel = Array.isArray(data.byChannel) ? data.byChannel as Row[] : [];
  const byEvent = Array.isArray(data.byEvent) ? data.byEvent as Row[] : [];
  const reviewQueue = Array.isArray(data.reviewQueue) ? data.reviewQueue as Row[] : [];
  const intakeByStatus = Array.isArray(data.intakeByStatus) ? data.intakeByStatus as Row[] : [];
  const totalEvents = useMemo(() => byChannel.reduce((sum, row) => sum + Number(row.events || 0), 0), [byChannel]);
  const totalIntake = useMemo(() => intakeByStatus.reduce((sum, row) => sum + Number(row.records || 0), 0), [intakeByStatus]);
  const pending = useMemo(() => reviewQueue.filter((row) => ["received", "review_required"].includes(String(row.status))).length, [reviewQueue]);
  const approved = useMemo(() => reviewQueue.filter((row) => row.status === "approved").length, [reviewQueue]);

  return <section className="sc-omnichannel-reporting">
    <header><div><span>Digital & integration reporting</span><h2>Website, App & SmartCommerce Activity</h2><p>Channel events and imported workflow records are reported alongside the POS so management can trace demand and operational hand-offs end to end.</p></div><button type="button" className="sc-button sc-button--secondary" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15}/>Refresh</button></header>
    <div className="sc-omnichannel-reporting__filters"><label>From<input type="date" value={start} onChange={(e) => setStart(e.target.value)}/></label><label>To<input type="date" value={end} onChange={(e) => setEnd(e.target.value)}/></label><button type="button" className="sc-button sc-button--primary" onClick={() => void refresh()} disabled={loading}>Apply period</button></div>
    {error ? <div className="sc-omnichannel-reporting__error">{error}</div> : null}
    <div className="sc-omnichannel-reporting__metrics"><article><span>Channel events</span><strong>{totalEvents}</strong></article><article><span>Imported records</span><strong>{totalIntake}</strong></article><article><span>Needs review</span><strong>{pending}</strong></article><article><span>Approved</span><strong>{approved}</strong></article></div>
    <div className="sc-omnichannel-reporting__grid">
      <section><h3>Activity by channel</h3>{byChannel.length ? <table><thead><tr><th>Channel</th><th>Events</th></tr></thead><tbody>{byChannel.map((row, i) => <tr key={i}><td>{label(row.source_channel)}</td><td>{Number(row.events || 0).toLocaleString()}</td></tr>)}</tbody></table> : <p>No channel events in this period.</p>}</section>
      <section><h3>Event mix</h3>{byEvent.length ? <table><thead><tr><th>Event</th><th>Channel</th><th>Count</th></tr></thead><tbody>{byEvent.slice(0, 40).map((row, i) => <tr key={i}><td>{label(row.event_type)}</td><td>{label(row.source_channel)}</td><td>{Number(row.events || 0).toLocaleString()}</td></tr>)}</tbody></table> : <p>No events in this period.</p>}</section>
      <section><h3>Review & approval ledger</h3>{reviewQueue.length ? <table><thead><tr><th>Received</th><th>Source</th><th>Record</th><th>Status</th><th>Reviewer</th></tr></thead><tbody>{reviewQueue.slice(0, 100).map((row, i) => <tr key={i}><td>{row.received_at ? new Date(row.received_at).toLocaleString("en-JM") : "—"}</td><td>{label(row.source_channel)}</td><td>{label(row.item_type)}</td><td>{label(row.status)}</td><td>{row.reviewer_employee_id || "—"}</td></tr>)}</tbody></table> : <p>No imported workflow records in this period.</p>}</section>
      <section><h3>Intake status by channel</h3>{intakeByStatus.length ? <table><thead><tr><th>Status</th><th>Channel</th><th>Records</th></tr></thead><tbody>{intakeByStatus.map((row, i) => <tr key={i}><td>{label(row.status)}</td><td>{label(row.source_channel)}</td><td>{Number(row.records || 0).toLocaleString()}</td></tr>)}</tbody></table> : <p>No intake records in this period.</p>}</section>
    </div>
    <ManagementExceptionPanel />
    <TechnicianCompensationReportingPanel />
  </section>;
}
