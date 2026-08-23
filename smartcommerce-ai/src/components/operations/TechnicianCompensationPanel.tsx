import { AlertCircle, BadgeDollarSign, History, Save, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { DEFAULT_TECHNICIAN_PLAN } from "../../lib/technicianCompensation";
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

type Payload = { plans: any[]; rates: RateRow[]; periods: any[]; canAdminister: boolean };

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

  const load = async () => {
    setLoading(true); setError("");
    try { setData(await request<Payload>("/api/technician-compensation")); }
    catch (e) { setError(e instanceof Error ? e.message : "Compensation data could not be loaded."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const activeRates = useMemo(() => (data?.rates || []).filter((rate) => !rate.effective_to), [data]);

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

  return (
    <section className="sc-tech-comp" aria-label="Technician compensation and standards">
      <header><div><BadgeDollarSign size={21} /><span>Performance & compensation</span><strong>Technician standards ledger</strong></div><small>Plan v{DEFAULT_TECHNICIAN_PLAN.version} · {DEFAULT_TECHNICIAN_PLAN.currency}</small></header>

      {error ? <div className="sc-tech-comp__error"><AlertCircle size={17} />{error}</div> : null}

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

      <div className="sc-tech-comp__history">
        <div><History size={17} /><strong>Active rate versions</strong><span>{activeRates.length}</span></div>
        {!activeRates.length ? <p>No technician rates have been configured in the compensation ledger yet.</p> : activeRates.map((rate) => (
          <article key={rate.id}><div><strong>Employee {rate.employee_id}</strong><span>{rate.grade || "Technician"}</span></div><div><small>Hourly</small><strong>{money(rate.hourly_rate)}</strong></div><div><small>OT</small><strong>{Number(rate.overtime_multiplier || 1).toFixed(2)}×</strong></div><div><small>Effective</small><strong>{String(rate.effective_from).slice(0, 10)}</strong></div></article>
        ))}
      </div>
    </section>
  );
}
