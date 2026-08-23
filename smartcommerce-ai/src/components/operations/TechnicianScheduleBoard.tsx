import { AlertCircle, CalendarDays, RefreshCw, Trash2, UserRoundPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { operationsRequest, type OperationsApiError } from "../../lib/staffOperations";
import "../../styles/technician-schedule.css";

type ScheduleRow = Record<string, any>;
type SchedulePayload = { scheduled?: ScheduleRow[]; unscheduled?: ScheduleRow[] };

function today() {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export default function TechnicianScheduleBoard({ onOpenWorkOrder }: { onOpenWorkOrder?: (id: string) => void }) {
  const [date, setDate] = useState(today());
  const [data, setData] = useState<SchedulePayload>({});
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { employeeId: string; notes: string }>>({});

  const scheduled = data.scheduled || [];
  const unscheduled = data.unscheduled || [];
  const capacity = useMemo(() => scheduled.reduce((sum, row) => sum + Math.max(0, Number(row.allotted_minutes || 0)), 0), [scheduled]);

  async function load() {
    setLoading(true); setError("");
    try {
      const schedule = await operationsRequest<SchedulePayload>(`work-orders/schedule?date=${encodeURIComponent(date)}`);
      setData(schedule || {});
      try {
        const staff = await operationsRequest<any>("employees?active=1");
        setEmployees(Array.isArray(staff) ? staff : Array.isArray(staff?.employees) ? staff.employees : []);
      } catch { setEmployees([]); }
    } catch (cause) { setError((cause as OperationsApiError).message || "Technician schedule could not be loaded."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [date]);

  async function assign(task: ScheduleRow) {
    const id = String(task.id);
    const draft = drafts[id];
    if (!draft?.employeeId || busy) return;
    setBusy(`assign:${id}`); setError("");
    try {
      await operationsRequest("work-orders/schedule", { method: "POST", body: JSON.stringify({ employee_id: draft.employeeId, work_order_task_id: task.id, scheduled_date: date, notes: draft.notes.trim() || null }) });
      setDrafts((current) => { const next = { ...current }; delete next[id]; return next; });
      await load();
    } catch (cause) { setError((cause as OperationsApiError).message || "Task could not be scheduled."); }
    finally { setBusy(null); }
  }

  async function remove(row: ScheduleRow) {
    const id = String(row.id);
    if (busy) return;
    setBusy(`remove:${id}`); setError("");
    try { await operationsRequest(`work-orders/schedule/${encodeURIComponent(id)}`, { method: "DELETE" }); await load(); }
    catch (cause) { setError((cause as OperationsApiError).message || "Schedule entry could not be removed."); }
    finally { setBusy(null); }
  }

  return <section className="sc-tech-schedule" aria-label="Technician scheduling" data-guide-id="technician-schedule">
    <header><div><CalendarDays size={19}/><div><span>Technician scheduling</span><strong>Day-ahead repair plan</strong></div></div><label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><button type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/>Refresh</button></header>
    {error ? <div className="sc-tech-schedule__error" role="alert"><AlertCircle size={15}/>{error}</div> : null}
    <div className="sc-tech-schedule__metrics"><article><span>Scheduled tasks</span><strong>{scheduled.length}</strong></article><article><span>Unscheduled tasks</span><strong>{unscheduled.length}</strong></article><article><span>Planned labor</span><strong>{Math.round(capacity / 60 * 10) / 10}h</strong></article></div>

    {loading ? <div className="sc-ops-empty"><strong>Loading schedule…</strong></div> : <div className="sc-tech-schedule__columns">
      <div><h3>Scheduled</h3>{scheduled.length ? <div className="sc-tech-schedule__list">{scheduled.map((row) => <article key={row.id}><div><small>{row.wo_number || "Work order"}</small><strong>{row.task_description || "Repair task"}</strong><span>{row.employee_name || `Technician ${row.employee_id}`}</span>{row.notes ? <em>{row.notes}</em> : null}</div><div><span>{Number(row.allotted_minutes || 0)} min</span>{row.work_order_id && onOpenWorkOrder ? <button type="button" onClick={() => onOpenWorkOrder(String(row.work_order_id))}>Open repair</button> : null}<button className="is-remove" type="button" disabled={Boolean(busy)} onClick={() => void remove(row)} aria-label="Remove schedule entry"><Trash2 size={14}/></button></div></article>)}</div> : <div className="sc-ops-empty"><strong>No tasks scheduled for this date</strong></div>}</div>

      <div><h3>Needs scheduling</h3>{unscheduled.length ? <div className="sc-tech-schedule__list">{unscheduled.map((task) => { const id = String(task.id); const draft = drafts[id] || { employeeId: "", notes: "" }; return <article key={task.id} className="is-unscheduled"><div><small>{task.wo_number || "Work order"}</small><strong>{task.description || "Repair task"}</strong><span>{task.required_skills ? `Skills: ${task.required_skills}` : "No required skill recorded"}</span><em>{Number(task.allotted_minutes || 0)} min allotted</em></div><div className="sc-tech-schedule__assign">{employees.length ? <select value={draft.employeeId} onChange={(event) => setDrafts((current) => ({ ...current, [id]: { ...draft, employeeId: event.target.value } }))}><option value="">Choose technician</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{[employee.first_name, employee.last_name].filter(Boolean).join(" ") || employee.username || `Employee ${employee.id}`}</option>)}</select> : <input value={draft.employeeId} onChange={(event) => setDrafts((current) => ({ ...current, [id]: { ...draft, employeeId: event.target.value } }))} placeholder="Technician ID" aria-label="Technician ID"/>}<input value={draft.notes} onChange={(event) => setDrafts((current) => ({ ...current, [id]: { ...draft, notes: event.target.value } }))} placeholder="Schedule note (optional)"/><button type="button" disabled={!draft.employeeId || Boolean(busy)} onClick={() => void assign(task)}><UserRoundPlus size={14}/>Schedule</button></div></article>; })}</div> : <div className="sc-ops-empty"><strong>Everything is scheduled</strong><p>No incomplete repair tasks are waiting for this date.</p></div>}</div>
    </div>}
  </section>;
}
