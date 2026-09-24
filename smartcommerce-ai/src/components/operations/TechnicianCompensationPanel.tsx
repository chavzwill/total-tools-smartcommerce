import { AlertCircle, BadgeDollarSign, CheckCircle2, Download, FileSearch, History, LockKeyhole, Save, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { DEFAULT_TECHNICIAN_PLAN, resolveTechnicianPayPeriod, type MetricKey } from "../../lib/technicianCompensation";
import "../../styles/technician-compensation.css";

type RateRow = {
  id: string;
  employee_id: string;
  hourly_rate: number | string;
  overtime_multiplier: number | string;
  grade?: string | null;
  effective_from: string;
  effective_to?: string | null;
  change_reason?: string;
  changed_by?: string;
};

type PeriodRow = {
  id: string;
  employee_id: string;
  period_start: string;
  period_end: string;
  status: "draft" | "review" | "approved" | "finalized" | "adjusted";
  result_json?: {
    performanceScore?: number;
    incentivePercent?: number;
    incentiveAmount?: number;
    totalPay?: number;
    incentiveEligible?: boolean;
    gateFailures?: string[];
  };
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  finalized_by?: string | null;
  finalized_at?: string | null;
};

type EvidenceMetric = {
  key: MetricKey;
  value: number | null;
  numerator?: number;
  denominator?: number;
  sourceRefs: string[];
  coverage: "verified" | "partial" | "unavailable";
  reason?: string;
};

type EvidencePayload = {
  evidence: {
    employeeId: string;
    period: { start: string; end: string; key?: string; label?: string };
    metrics: Record<MetricKey, EvidenceMetric>;
    sourceCoverage: { completedWorkOrders: number; technicianTasks: number; timedTasks: number; sourceExportGaps: string[] };
    compensationHours: { regularHours: null; overtimeHours: null; coverage: "unavailable"; reason: string };
    safetyEligible: null;
    minimumSampleSatisfied: boolean;
    incentiveReady: boolean;
  };
};

type Payload = { plans: any[]; rates: RateRow[]; periods: PeriodRow[]; canAdminister: boolean; canReview?: boolean; currentPeriod?: { start: string; end: string; key: string } };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...init,
    headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(init?.headers || {}) },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || "Compensation data could not be loaded.");
  return payload as T;
}

const money = (value: unknown) => new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", maximumFractionDigits: 2 }).format(Number(value || 0));
const pct = (value: unknown) => `${Number(value || 0).toFixed(1)}%`;
const metricLabel = (key: MetricKey) => DEFAULT_TECHNICIAN_PLAN.metrics.find((metric) => metric.key === key)?.label || key;

export default function TechnicianCompensationPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [overtimeMultiplier, setOvertimeMultiplier] = useState("1.5");
  const [grade, setGrade] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [evidenceEmployeeId, setEvidenceEmployeeId] = useState("");
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidence, setEvidence] = useState<EvidencePayload["evidence"] | null>(null);

  const load = async () => {
    setLoading(true); setError("");
    try { setData(await request<Payload>("/api/technician-compensation")); }
    catch (e) { setError(e instanceof Error ? e.message : "Compensation data could not be loaded."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const activeRates = useMemo(() => (data?.rates || []).filter((rate) => !rate.effective_to), [data]);
  const currentPeriod = data?.currentPeriod || resolveTechnicianPayPeriod(new Date().toISOString().slice(0, 10));

  async function saveRate(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError("");
    try {
      await request("/api/technician-compensation", {
        method: "POST",
        body: JSON.stringify({ action: "set_rate", employeeId: employeeId.trim(), hourlyRate: Number(hourlyRate), overtimeMultiplier: Number(overtimeMultiplier), grade: grade.trim(), effectiveFrom, reason: reason.trim() }),
      });
      setHourlyRate(""); setGrade(""); setReason("");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Rate change could not be saved."); }
    finally { setSaving(false); }
  }

  async function inspectEvidence(event: FormEvent) {
    event.preventDefault();
    if (!evidenceEmployeeId.trim() || evidenceLoading) return;
    setEvidenceLoading(true); setError(""); setEvidence(null);
    try {
      const payload = await request<EvidencePayload>(`/api/technician-performance-evidence?employeeId=${encodeURIComponent(evidenceEmployeeId.trim())}&periodRef=${encodeURIComponent(currentPeriod.start)}`);
      setEvidence(payload.evidence);
    } catch (e) { setError(e instanceof Error ? e.message : "Performance evidence could not be loaded."); }
    finally { setEvidenceLoading(false); }
  }

  const exportHref = `/api/technician-compensation?export=csv&periodRef=${encodeURIComponent(currentPeriod.start)}`;

  return (
    <section className="sc-tech-comp" aria-label="Technician compensation and standards">
      <header><div><BadgeDollarSign size={21} /><span>Performance & compensation</span><strong>Technician standards ledger</strong></div><small>Plan v{DEFAULT_TECHNICIAN_PLAN.version} · {DEFAULT_TECHNICIAN_PLAN.currency}</small></header>

      {error ? <div className="sc-tech-comp__error"><AlertCircle size={17} />{error}</div> : null}

      <div className="sc-tech-comp__period-banner">
        <div><span>Current pay period</span><strong>{currentPeriod.start} → {currentPeriod.end}</strong><small>Total Tools cycle: 29th–13th / 14th–28th</small></div>
        {data?.canAdminister ? <a href={exportHref} className="sc-button sc-button--secondary"><Download size={15} />Export payroll CSV</a> : null}
      </div>

      <div className="sc-tech-comp__standards">
        {DEFAULT_TECHNICIAN_PLAN.metrics.map((metric) => (
          <article key={metric.key} className={metric.hardGate ? "is-gate" : undefined}>
            <span>{metric.label}{metric.hardGate ? <ShieldCheck size={13} /> : null}</span>
            <strong>{metric.target}% target</strong>
            <small>Minimum {metric.minimum}% · Weight {metric.weight}%</small>
          </article>
        ))}
      </div>

      {loading ? <div className="sc-tech-comp__loading">Loading compensation ledger…</div> : null}

      {data?.canReview ? (
        <section className="sc-tech-comp__evidence">
          <div className="sc-tech-comp__section-title"><FileSearch size={17} /><strong>Source evidence audit</strong><span>Fail-closed</span></div>
          <form onSubmit={inspectEvidence}>
            <label>Technician employee ID<input required value={evidenceEmployeeId} onChange={(e) => setEvidenceEmployeeId(e.target.value)} placeholder="Employee ID" /></label>
            <button type="submit" disabled={evidenceLoading || !evidenceEmployeeId.trim()}><FileSearch size={15} />{evidenceLoading ? "Checking…" : "Inspect current period evidence"}</button>
          </form>
          {evidence ? (
            <div className="sc-tech-comp__evidence-result">
              <header><div><strong>Employee {evidence.employeeId}</strong><span>{evidence.period.start} → {evidence.period.end}</span></div><em className={evidence.incentiveReady ? "is-ready" : "is-blocked"}>{evidence.incentiveReady ? "Incentive evidence ready" : "Incentive blocked: evidence incomplete"}</em></header>
              <div className="sc-tech-comp__evidence-summary"><span>{evidence.sourceCoverage.completedWorkOrders} completed work orders</span><span>{evidence.sourceCoverage.technicianTasks} completed technician tasks</span><span>{evidence.sourceCoverage.timedTasks} timed tasks</span></div>
              <div className="sc-tech-comp__evidence-grid">
                {(Object.keys(evidence.metrics) as MetricKey[]).map((key) => {
                  const item = evidence.metrics[key];
                  return <article key={key} className={`is-${item.coverage}`}><div><strong>{metricLabel(key)}</strong><em>{item.coverage}</em></div><b>{item.value == null ? "—" : pct(item.value)}</b><small>{item.reason || `${item.sourceRefs.length} auditable source reference${item.sourceRefs.length === 1 ? "" : "s"}`}</small></article>;
                })}
              </div>
              <div className="sc-tech-comp__source-gaps"><strong>POS exports still required before automated incentives can finalize</strong><ul>{evidence.sourceCoverage.sourceExportGaps.map((gap) => <li key={gap}>{gap}</li>)}</ul></div>
            </div>
          ) : null}
        </section>
      ) : null}

      {data?.canAdminister ? (
        <form className="sc-tech-comp__rate-form" onSubmit={saveRate}>
          <div className="sc-tech-comp__form-title"><strong>Set technician rate</strong><span>Creates a new effective-dated version; prior history is retained.</span></div>
          <label>Employee ID<input required value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} data-guide-id="tech-rate-employee" /></label>
          <label>Hourly rate (JMD)<input required min="0" step="0.01" inputMode="decimal" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} data-guide-id="tech-rate-hourly" /></label>
          <label>Overtime multiplier<input required min="1" step="0.05" inputMode="decimal" value={overtimeMultiplier} onChange={(e) => setOvertimeMultiplier(e.target.value)} /></label>
          <label>Grade<input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="e.g. Senior Technician" /></label>
          <label>Effective date<input required type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} /></label>
          <label className="is-wide">Reason for change<input required minLength={5} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Promotion, annual review, correction…" /></label>
          <button type="submit" disabled={saving || !employeeId || !hourlyRate || reason.trim().length < 5}><Save size={16} />{saving ? "Saving…" : "Save rate version"}</button>
        </form>
      ) : null}

      <div className="sc-tech-comp__periods">
        <div className="sc-tech-comp__section-title"><CheckCircle2 size={17} /><strong>Pay-period scorecards</strong><span>{data?.periods?.length || 0}</span></div>
        {!data?.periods?.length ? <p>No technician performance periods have been calculated yet.</p> : data.periods.map((period) => {
          const result = period.result_json || {};
          const failures = Array.isArray(result.gateFailures) ? result.gateFailures : [];
          return (
            <article key={period.id} className={`is-${period.status}`}>
              <div className="sc-tech-comp__period-head"><div><strong>Employee {period.employee_id}</strong><span>{String(period.period_start).slice(0,10)} → {String(period.period_end).slice(0,10)}</span></div><em>{period.status}</em></div>
              <div className="sc-tech-comp__period-metrics"><div><small>Score</small><strong>{pct(result.performanceScore)}</strong></div><div><small>Incentive</small><strong>{pct(result.incentivePercent)}</strong></div><div><small>Incentive pay</small><strong>{money(result.incentiveAmount)}</strong></div><div><small>Total</small><strong>{money(result.totalPay)}</strong></div></div>
              {failures.length ? <div className="sc-tech-comp__gates"><AlertCircle size={14} /><span>Quality gate: {failures.join(", ")}</span></div> : <div className="sc-tech-comp__gates is-clear"><ShieldCheck size={14} /><span>Quality gates passed</span></div>}
              <div className="sc-tech-comp__period-actions">
                <p>Payroll approval and finalization are performed in the POS. Synchronization is pending.</p>
                {period.status === "finalized" ? <span><LockKeyhole size={14} />Finalized and immutable</span> : null}
              </div>
            </article>
          );
        })}
      </div>

      <div className="sc-tech-comp__history">
        <div><History size={17} /><strong>Active rate versions</strong><span>{activeRates.length}</span></div>
        {!activeRates.length ? <p>No technician rates have been configured in the compensation ledger yet.</p> : activeRates.map((rate) => (
          <article key={rate.id}><div><strong>Employee {rate.employee_id}</strong><span>{rate.grade || "Technician"}</span></div><div><small>Hourly</small><strong>{money(rate.hourly_rate)}</strong></div><div><small>OT</small><strong>{Number(rate.overtime_multiplier || 1).toFixed(2)}×</strong></div><div><small>Effective</small><strong>{String(rate.effective_from).slice(0, 10)}</strong></div></article>
        ))}
      </div>
    </section>
  );
}
