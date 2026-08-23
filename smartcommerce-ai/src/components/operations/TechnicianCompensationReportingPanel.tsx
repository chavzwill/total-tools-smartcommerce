import { Download, Printer, RefreshCw, ShieldAlert, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { StaffIdentity } from "../../lib/staffOperations";
import "../../styles/technician-compensation-reporting.css";

type Row = Record<string, any>;

type CompensationPayload = {
  plans?: Row[];
  rates?: Row[];
  periods?: Row[];
  canAdminister?: boolean;
  canReview?: boolean;
  currentPeriod?: { start: string; end: string; label: string; cycle: string };
  error?: { message?: string };
};

const money = (value: unknown) => new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", maximumFractionDigits: 2 }).format(Number(value || 0));
const number = (value: unknown, digits = 1) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "—";
const dateOnly = (value: unknown) => String(value || "").slice(0, 10) || "—";
const title = (value: unknown) => String(value || "—").replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
const canSee = (staff: StaffIdentity) => {
  const role = String(staff.role || "").toLowerCase();
  const group = String(staff.securityGroupName || "").toLowerCase();
  return role === "admin" || role === "owner" || group.includes("admin") || staff.permissions.technician_compensation_admin === true || staff.permissions.technician_compensation_review === true || staff.permissions.wo_supervisor === true;
};

async function loadCompensation(periodRef: string) {
  const response = await fetch(`/api/technician-compensation?periodRef=${encodeURIComponent(periodRef)}`, { credentials: "same-origin", headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null) as CompensationPayload | null;
  if (!response.ok) throw new Error(payload?.error?.message || "Technician compensation reporting is unavailable.");
  return payload || {};
}

function csv(value: unknown) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default function TechnicianCompensationReportingPanel({ staff }: { staff: StaffIdentity }) {
  const today = new Date().toISOString().slice(0, 10);
  const [periodRef, setPeriodRef] = useState(today);
  const [data, setData] = useState<CompensationPayload>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const allowed = canSee(staff);
  async function refresh() {
    if (!allowed) return;
    setLoading(true); setError("");
    try { setData(await loadCompensation(periodRef)); }
    catch (e) { setError((e as Error).message); setData({}); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, [allowed]);

  const selected = data.currentPeriod || { start: "", end: "", label: "", cycle: "" };
  const periods = useMemo(() => (Array.isArray(data.periods) ? data.periods : []).filter((row) => {
    if (!selected.start || !selected.end) return true;
    return dateOnly(row.period_start) === selected.start && dateOnly(row.period_end) === selected.end;
  }), [data.periods, selected.start, selected.end]);

  const summary = useMemo(() => periods.reduce((acc, row) => {
    const result = row.result_json || {};
    acc.technicians += 1;
    acc.approved += ["approved", "finalized", "adjusted"].includes(String(row.status)) ? 1 : 0;
    acc.totalPay += Number(result.totalPay || 0);
    acc.incentives += Number(result.incentiveAmount || 0);
    return acc;
  }, { technicians: 0, approved: 0, totalPay: 0, incentives: 0 }), [periods]);

  function exportVisible() {
    const headers = ["Employee", "Period start", "Period end", "Status", "Performance score", "Incentive %", "Incentive amount", "Total pay", "Regular hours", "Overtime hours", "Finalized"];
    const body = periods.map((row) => {
      const result = row.result_json || {};
      const snapshot = row.snapshot_json || {};
      return [row.employee_id, dateOnly(row.period_start), dateOnly(row.period_end), row.status, result.performanceScore, result.incentivePercent, result.incentiveAmount, result.totalPay, snapshot.regularHours, snapshot.overtimeHours, row.finalized_at].map(csv).join(",");
    });
    const blob = new Blob([[headers.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `technician-pay-period-${selected.start || periodRef}-to-${selected.end || periodRef}.csv`; document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (!allowed) return null;

  return <section className="sc-tech-pay-report" data-guide-id="technician-pay-period-report">
    <header>
      <div><span>Workforce & payroll evidence</span><h2>Technician Pay-Period Reporting</h2><p>Compensation periods follow Total Tools' 29→13 and 14→28 payroll cycles. Final pay remains based on approved compensation snapshots, not repair timers alone.</p></div>
      <div className="sc-tech-pay-report__actions"><button type="button" className="sc-button sc-button--secondary" onClick={exportVisible} disabled={!periods.length}><Download size={15}/>CSV</button><button type="button" className="sc-button sc-button--secondary" onClick={() => window.print()}><Printer size={15}/>Print / PDF</button><button type="button" className="sc-button sc-button--secondary" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15}/>{loading ? "Loading…" : "Refresh"}</button></div>
    </header>
    <div className="sc-tech-pay-report__period"><label>Pay-period date<input type="date" value={periodRef} onChange={(e) => setPeriodRef(e.target.value)} /></label><button type="button" className="sc-button sc-button--primary" onClick={() => void refresh()} disabled={loading}>Load pay period</button><div><small>Resolved cycle</small><strong>{selected.label || "—"}</strong><span>{selected.cycle ? `Cycle ${selected.cycle}` : ""}</span></div></div>
    {error ? <div className="sc-tech-pay-report__warning"><ShieldAlert size={16}/>{error}</div> : null}
    <div className="sc-tech-pay-report__metrics"><article><span>Technicians</span><strong>{summary.technicians}</strong></article><article><span>Approved/finalized</span><strong>{summary.approved}</strong></article><article><span>Incentives</span><strong>{money(summary.incentives)}</strong></article><article><span>Recorded total pay</span><strong>{money(summary.totalPay)}</strong></article></div>
    {!loading && !periods.length ? <div className="sc-tech-pay-report__empty"><Wrench size={22}/><strong>No compensation snapshots for this pay period.</strong><span>This does not mean zero payroll. A technician period must first be created from verified evidence and the active rate/plan.</span></div> : <div className="sc-tech-pay-report__table"><table><thead><tr><th>Technician</th><th>Status</th><th>Score</th><th>Incentive</th><th>Incentive amount</th><th>Total pay</th><th>Hours evidence</th><th>Finalized</th></tr></thead><tbody>{periods.map((row) => { const result = row.result_json || {}; const snapshot = row.snapshot_json || {}; const hoursKnown = Number.isFinite(Number(snapshot.regularHours)) && Number.isFinite(Number(snapshot.overtimeHours)); return <tr key={String(row.id)}><td><strong>{row.employee_id}</strong><small>{dateOnly(row.period_start)} → {dateOnly(row.period_end)}</small></td><td>{title(row.status)}</td><td>{number(result.performanceScore)}%</td><td>{number(result.incentivePercent)}%</td><td>{money(result.incentiveAmount)}</td><td>{money(result.totalPay)}</td><td>{hoursKnown ? `${number(snapshot.regularHours)} regular / ${number(snapshot.overtimeHours)} OT` : "Not verified"}</td><td>{row.finalized_at ? new Date(row.finalized_at).toLocaleString("en-JM") : "—"}</td></tr>; })}</tbody></table></div>}
    <footer><strong>Evidence rule:</strong> unavailable QC/comeback/attendance/safety evidence must remain unavailable. It must not be converted into a guessed technician score or payroll amount.</footer>
  </section>;
}
