import { Download, Printer, RefreshCw, ShieldAlert, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import "../../styles/technician-compensation-reporting.css";

type Row = Record<string, any>;
type CompensationPayload = { plans?: Row[]; rates?: Row[]; periods?: Row[]; canAdminister?: boolean; canReview?: boolean; currentPeriod?: { start: string; end: string; label: string; cycle: string }; error?: { message?: string } };
type EvidencePayload = { evidence?: Row; error?: { message?: string } };

const money = (value: unknown) => new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", maximumFractionDigits: 2 }).format(Number(value || 0));
const number = (value: unknown, digits = 1) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "—";
const dateOnly = (value: unknown) => String(value || "").slice(0, 10) || "—";
const title = (value: unknown) => String(value || "—").replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

async function loadCompensation(periodRef: string) {
  const response = await fetch(`/api/technician-compensation?periodRef=${encodeURIComponent(periodRef)}`, { credentials: "same-origin", headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null) as CompensationPayload | null;
  if (!response.ok) throw new Error(payload?.error?.message || "Technician compensation reporting is unavailable.");
  return payload || {};
}
async function loadEvidence(employeeId: string, periodRef: string) {
  const response = await fetch(`/api/technician-performance-evidence?employeeId=${encodeURIComponent(employeeId)}&periodRef=${encodeURIComponent(periodRef)}`, { credentials: "same-origin", headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null) as EvidencePayload | null;
  if (!response.ok) throw new Error(payload?.error?.message || "Technician evidence is unavailable.");
  return payload?.evidence || {};
}
function csv(value: unknown) { const text = value == null ? "" : String(value); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }

export default function TechnicianCompensationReportingPanel() {
  const today = new Date().toISOString().slice(0, 10);
  const [periodRef, setPeriodRef] = useState(today);
  const [data, setData] = useState<CompensationPayload>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [visible, setVisible] = useState(true);
  const [evidence, setEvidence] = useState<Row | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState("");
  const [evidenceError, setEvidenceError] = useState("");

  async function refresh() {
    setLoading(true); setError(""); setEvidence(null); setEvidenceError("");
    try { const next = await loadCompensation(periodRef); setData(next); setVisible(next.canReview === true || next.canAdminister === true); }
    catch (e) { const message = (e as Error).message; if (/permission|administrator|supervisor/i.test(message)) setVisible(false); else { setError(message); setData({}); } }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);

  const selected = data.currentPeriod || { start: "", end: "", label: "", cycle: "" };
  const periods = useMemo(() => (Array.isArray(data.periods) ? data.periods : []).filter((row) => !selected.start || (dateOnly(row.period_start) === selected.start && dateOnly(row.period_end) === selected.end)), [data.periods, selected.start, selected.end]);
  const summary = useMemo(() => periods.reduce((acc, row) => { const result = row.result_json || {}; acc.technicians += 1; acc.approved += ["approved", "finalized", "adjusted"].includes(String(row.status)) ? 1 : 0; acc.totalPay += Number(result.totalPay || 0); acc.incentives += Number(result.incentiveAmount || 0); return acc; }, { technicians: 0, approved: 0, totalPay: 0, incentives: 0 }), [periods]);

  async function inspect(row: Row) {
    const employeeId = String(row.employee_id || ""); if (!employeeId || evidenceLoading) return;
    setEvidenceLoading(employeeId); setEvidenceError(""); setEvidence(null);
    try { setEvidence(await loadEvidence(employeeId, dateOnly(row.period_start) === "—" ? periodRef : dateOnly(row.period_start))); }
    catch (e) { setEvidenceError((e as Error).message); }
    finally { setEvidenceLoading(""); }
  }

  function exportVisible() {
    const headers = ["Employee", "Period start", "Period end", "Status", "Performance score", "Incentive %", "Incentive amount", "Total pay", "Regular hours", "Overtime hours", "Finalized"];
    const body = periods.map((row) => { const result = row.result_json || {}; const snapshot = row.snapshot_json || {}; return [row.employee_id, dateOnly(row.period_start), dateOnly(row.period_end), row.status, result.performanceScore, result.incentivePercent, result.incentiveAmount, result.totalPay, snapshot.regularHours, snapshot.overtimeHours, row.finalized_at].map(csv).join(","); });
    const blob = new Blob([[headers.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `technician-pay-period-${selected.start || periodRef}-to-${selected.end || periodRef}.csv`; document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (!visible) return null;
  const metrics = evidence?.metrics && typeof evidence.metrics === "object" ? Object.values(evidence.metrics) as Row[] : [];
  const gaps = Array.isArray(evidence?.sourceCoverage?.sourceExportGaps) ? evidence!.sourceCoverage.sourceExportGaps as string[] : [];

  return <section className="sc-tech-pay-report" data-guide-id="technician-pay-period-report">
    <header><div><span>Workforce & payroll evidence</span><h2>Technician Pay-Period Reporting</h2><p>Compensation periods follow Total Tools' 29→13 and 14→28 payroll cycles. Final pay remains based on approved compensation snapshots, not repair timers alone.</p></div><div className="sc-tech-pay-report__actions"><button type="button" className="sc-button sc-button--secondary" onClick={exportVisible} disabled={!periods.length}><Download size={15}/>CSV</button><button type="button" className="sc-button sc-button--secondary" onClick={() => window.print()}><Printer size={15}/>Print / PDF</button><button type="button" className="sc-button sc-button--secondary" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15}/>{loading ? "Loading…" : "Refresh"}</button></div></header>
    <div className="sc-tech-pay-report__period"><label>Pay-period date<input type="date" value={periodRef} onChange={(e) => setPeriodRef(e.target.value)} /></label><button type="button" className="sc-button sc-button--primary" onClick={() => void refresh()} disabled={loading}>Load pay period</button><div><small>Resolved cycle</small><strong>{selected.label || "—"}</strong><span>{selected.cycle ? `Cycle ${selected.cycle}` : ""}</span></div></div>
    {error ? <div className="sc-tech-pay-report__warning"><ShieldAlert size={16}/>{error}</div> : null}
    <div className="sc-tech-pay-report__metrics"><article><span>Technicians</span><strong>{summary.technicians}</strong></article><article><span>Approved/finalized</span><strong>{summary.approved}</strong></article><article><span>Incentives</span><strong>{money(summary.incentives)}</strong></article><article><span>Recorded total pay</span><strong>{money(summary.totalPay)}</strong></article></div>
    {!loading && !periods.length ? <div className="sc-tech-pay-report__empty"><Wrench size={22}/><strong>No compensation snapshots for this pay period.</strong><span>This does not mean zero payroll. A technician period must first be created from verified evidence and the active rate/plan.</span></div> : <div className="sc-tech-pay-report__table"><table><thead><tr><th>Technician</th><th>Status</th><th>Score</th><th>Incentive</th><th>Incentive amount</th><th>Total pay</th><th>Hours evidence</th><th>Finalized</th><th>Evidence</th></tr></thead><tbody>{periods.map((row) => { const result = row.result_json || {}; const snapshot = row.snapshot_json || {}; const hoursKnown = Number.isFinite(Number(snapshot.regularHours)) && Number.isFinite(Number(snapshot.overtimeHours)); return <tr key={String(row.id)}><td><strong>{row.employee_id}</strong><small>{dateOnly(row.period_start)} → {dateOnly(row.period_end)}</small></td><td>{title(row.status)}</td><td>{number(result.performanceScore)}%</td><td>{number(result.incentivePercent)}%</td><td>{money(result.incentiveAmount)}</td><td>{money(result.totalPay)}</td><td>{hoursKnown ? `${number(snapshot.regularHours)} regular / ${number(snapshot.overtimeHours)} OT` : "Not verified"}</td><td>{row.finalized_at ? new Date(row.finalized_at).toLocaleString("en-JM") : "—"}</td><td><button type="button" className="sc-tech-pay-report__inspect" onClick={() => void inspect(row)} disabled={Boolean(evidenceLoading)}>{evidenceLoading === String(row.employee_id) ? "Loading…" : "Inspect"}</button></td></tr>; })}</tbody></table></div>}
    {evidenceError ? <div className="sc-tech-pay-report__warning"><ShieldAlert size={16}/>{evidenceError}</div> : null}
    {evidence ? <section className="sc-tech-pay-report__evidence"><header><div><span>Evidence drill-down</span><strong>Technician {evidence.employeeId}</strong><small>{evidence.period?.label || "Selected pay period"}</small></div><em data-ready={evidence.incentiveReady ? "yes" : "no"}>{evidence.incentiveReady ? "Incentive evidence ready" : "Incentive evidence incomplete"}</em></header><div className="sc-tech-pay-report__evidence-grid">{metrics.map((metric) => <article key={String(metric.key)}><span>{title(metric.key)}</span><strong>{metric.value == null ? "Unavailable" : `${number(metric.value)}%`}</strong><small>{title(metric.coverage)}{metric.reason ? ` · ${metric.reason}` : ""}</small></article>)}</div><div className="sc-tech-pay-report__coverage"><strong>Source coverage</strong><span>{Number(evidence.sourceCoverage?.completedWorkOrders || 0)} completed work orders · {Number(evidence.sourceCoverage?.technicianTasks || 0)} technician tasks · {Number(evidence.sourceCoverage?.timedTasks || 0)} timed tasks</span><span>Payroll hours: {evidence.compensationHours?.coverage === "unavailable" ? "not available from POS evidence" : title(evidence.compensationHours?.coverage)}</span>{gaps.length ? <details><summary>Required source exports still missing ({gaps.length})</summary><ul>{gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul></details> : null}</div></section> : null}
    <footer><strong>Evidence rule:</strong> unavailable QC/comeback/attendance/safety evidence must remain unavailable. It must not be converted into a guessed technician score or payroll amount.</footer>
  </section>;
}
