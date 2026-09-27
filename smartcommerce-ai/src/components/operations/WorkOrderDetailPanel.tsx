import { AlertCircle, ArrowLeft, CheckCircle2, Clock3, PackageSearch, Play, RefreshCw, Square, UserRound, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { operationsRequest, type OperationsApiError } from "../../lib/staffOperations";
import ServiceAdvisorPanel from "./ServiceAdvisorPanel";
import "../../styles/work-order-detail.css";

type Props = {
  workOrderId: string;
  onClose: () => void;
  staffEmployeeId?: string;
  canManageTasks?: boolean;
  canAssess?: boolean;
  canAssignParts?: boolean;
};

type Detail = Record<string, any> & {
  items?: any[];
  tasks?: any[];
  status_log?: any[];
};

const label = (value: unknown) => String(value || "—").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const minutes = (value: unknown) => {
  const total = Math.max(0, Math.round(Number(value || 0)));
  if (!total) return "0m";
  const h = Math.floor(total / 60); const m = total % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
};

export default function WorkOrderDetailPanel({ workOrderId, onClose, staffEmployeeId, canManageTasks = false, canAssess = false, canAssignParts = false }: Props) {
  const [state, setState] = useState<{ loading: boolean; data?: Detail; error?: string }>({ loading: true });
  const [action, setAction] = useState<{ taskId?: string; type?: "clock-in" | "clock-out" | "complete"; error?: string }>({});

  const load = async () => {
    setState({ loading: true });
    try { setState({ loading: false, data: await operationsRequest<Detail>(`work-orders/${encodeURIComponent(workOrderId)}`) }); }
    catch (error) { setState({ loading: false, error: (error as OperationsApiError).message || "Work order could not be loaded." }); }
  };

  useEffect(() => { void load(); }, [workOrderId]);

  const data = state.data;
  const taskMinutes = useMemo(() => (data?.tasks || []).reduce((sum, task) => sum + Number(task.actual_minutes || 0), 0), [data]);
  const openTasks = useMemo(() => (data?.tasks || []).filter((task) => task.status !== "complete").length, [data]);

  async function runTaskAction(task: any, type: "clock-in" | "clock-out" | "complete") {
    const taskId = String(task.id);
    setAction({ taskId, type });
    try {
      if (type === "clock-in") {
        const technicianId = task.technician_id || staffEmployeeId;
        if (!technicianId) throw new Error("Assign a technician before starting this timer.");
        await operationsRequest(`work-orders/tasks/${encodeURIComponent(taskId)}/clock-in`, {
          method: "POST",
          body: JSON.stringify({ technician_id: technicianId }),
        });
      } else if (type === "clock-out") {
        await operationsRequest(`work-orders/tasks/${encodeURIComponent(taskId)}/clock-out`, { method: "POST", body: JSON.stringify({}) });
      } else {
        await operationsRequest(`work-orders/tasks/${encodeURIComponent(taskId)}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "complete" }),
        });
      }
      setAction({});
      await load();
    } catch (error) {
      setAction({ taskId, type, error: (error as OperationsApiError).message || "The technician action could not be completed." });
    }
  }

  return (
    <section className="sc-wo-detail" aria-label="Work order detail" data-guide-id="work-order-detail">
      <header className="sc-wo-detail__header">
        <button type="button" className="sc-wo-detail__back" onClick={onClose}><ArrowLeft size={17} />Back to repairs</button>
        {data ? <div><span>{label(data.status)}</span><strong>{data.wo_number || `Work order ${workOrderId}`}</strong><small>{data.branch_name || "Branch not set"}</small></div> : null}
      </header>

      {state.loading ? <div className="sc-ops-auth-state"><Clock3 size={22} /><strong>Loading work order…</strong></div> : null}
      {state.error ? <div className="sc-ops-empty is-error"><AlertCircle size={20} /><strong>Work order unavailable</strong><p>{state.error}</p><button className="sc-button sc-button--secondary" onClick={load}><RefreshCw size={16} />Retry</button></div> : null}

      {data ? (
        <div className="sc-wo-detail__body">
          <div className="sc-wo-detail__metrics">
            <article><span>Open tasks</span><strong>{openTasks}</strong><small>{data.tasks?.length || 0} total</small></article>
            <article><span>Recorded work</span><strong>{minutes(taskMinutes)}</strong><small>Completed timer entries</small></article>
            <article><span>Parts lines</span><strong>{data.items?.length || 0}</strong><small>Assigned to repair</small></article>
            <article><span>Pickup</span><strong>{data.pickup_due_date || "Not set"}</strong><small>{Number(data.days_past_pickup_due || 0) > 0 ? `${Math.ceil(Number(data.days_past_pickup_due))} days overdue` : "Current"}</small></article>
          </div>

          <ServiceAdvisorPanel workOrder={data} staffEmployeeId={staffEmployeeId} canAssess={canAssess} canAssignParts={canAssignParts} onUpdated={load} />

          <div className="sc-wo-detail__grid">
            <section className="sc-wo-detail__card">
              <div className="sc-wo-detail__card-title"><UserRound size={18} /><div><span>Customer & intake</span><strong>{data.customer_name || "Customer not named"}</strong></div></div>
              <dl><div><dt>Phone</dt><dd>{data.customer_phone || "—"}</dd></div><div><dt>Email</dt><dd>{data.customer_email || "—"}</dd></div><div><dt>Equipment</dt><dd>{data.equipment_name || data.item_label || data.item_description || "—"}</dd></div><div><dt>Issue</dt><dd>{data.problem_description || data.issue_description || data.description || "—"}</dd></div></dl>
            </section>

            <section className="sc-wo-detail__card">
              <div className="sc-wo-detail__card-title"><Wrench size={18} /><div><span>Service ownership</span><strong>{data.employee_name || "Unassigned"}</strong></div></div>
              <dl><div><dt>Status</dt><dd>{label(data.status)}</dd></div><div><dt>Created</dt><dd>{data.created_at || "—"}</dd></div><div><dt>Assessment</dt><dd>{data.assessment_notes || data.diagnosis || data.estimate_notes || "—"}</dd></div><div><dt>Deposit</dt><dd>{data.deposit_transaction_id ? "Received" : data.deposit_amount ? "Required" : "Not set"}</dd></div></dl>
            </section>
          </div>

          <section className="sc-wo-detail__section">
            <div className="sc-wo-detail__section-title"><Clock3 size={18} /><div><strong>Technician tasks</strong><span>Assignments, allotted time and actual recorded work</span></div></div>
            {(data.tasks || []).length ? <div className="sc-wo-task-list">{data.tasks!.map((task: any) => {
              const taskId = String(task.id);
              const busy = action.taskId === taskId && Boolean(action.type);
              const running = Boolean(task.open_time_entry_id);
              const complete = task.status === "complete";
              return <article key={task.id} className={running ? "is-running" : undefined}>
                <div className="sc-wo-task-list__identity"><span className={`sc-work-order-status is-${complete ? "pickup" : "active"}`}>{label(task.status)}</span><strong>{task.description || `Task ${task.id}`}</strong><small>{task.technician_name || "Unassigned technician"}</small>{running ? <em><Clock3 size={13} />Timer active since {task.open_time_entry_started_at || "now"}</em> : null}</div>
                <dl><div><dt>Allowed</dt><dd>{minutes(task.allotted_minutes)}</dd></div><div><dt>Actual</dt><dd>{minutes(task.actual_minutes)}</dd></div><div><dt>Skills</dt><dd>{task.required_skills || "—"}</dd></div></dl>
                {canManageTasks ? <div className="sc-wo-task-actions" aria-label={`Actions for ${task.description || `task ${task.id}`}`}>
                  {!complete && !running ? <button type="button" className="is-start" disabled={busy} onClick={() => void runTaskAction(task, "clock-in")}><Play size={15} />Start work</button> : null}
                  {!complete && running ? <button type="button" className="is-stop" disabled={busy} onClick={() => void runTaskAction(task, "clock-out")}><Square size={14} />Stop timer</button> : null}
                  {!complete ? <button type="button" disabled={busy || running} title={running ? "Stop the timer before completing this task" : undefined} onClick={() => void runTaskAction(task, "complete")}><CheckCircle2 size={15} />Complete</button> : <span className="sc-wo-task-done"><CheckCircle2 size={15} />Completed</span>}
                </div> : null}
                {action.taskId === taskId && action.error ? <p className="sc-wo-task-error" role="alert"><AlertCircle size={14} />{action.error}</p> : null}
              </article>;
            })}</div> : <div className="sc-ops-empty"><strong>No technician tasks yet</strong><p>Tasks will appear when the work order has been broken into repair work.</p></div>}
          </section>

          <section className="sc-wo-detail__section">
            <div className="sc-wo-detail__section-title"><PackageSearch size={18} /><div><strong>Parts & sourcing</strong><span>Inventory, customer-supplied parts, transfers and purchase requests</span></div></div>
            {(data.items || []).length ? <div className="sc-wo-parts-list">{data.items!.map((item: any) => <article key={item.id}><div><strong>{item.product_name || item.sku || `Part ${item.id}`}</strong><span>{item.sku || "No SKU"}</span></div><div><small>Qty</small><strong>{item.quantity || 0}</strong></div><div><small>Source</small><strong>{item.is_customer_supplied ? "Customer supplied" : (item.sources?.length ? `${item.sources.length} source${item.sources.length === 1 ? "" : "s"}` : "Not resolved")}</strong></div><div><small>Purchase request</small><strong>{item.purchase_request_number || "—"}</strong></div></article>)}</div> : <div className="sc-ops-empty"><strong>No parts assigned</strong><p>Parts will appear here as the repair is assessed and sourced.</p></div>}
          </section>

          <section className="sc-wo-detail__section">
            <div className="sc-wo-detail__section-title"><Clock3 size={18} /><div><strong>Status history</strong><span>Recorded repair lifecycle events</span></div></div>
            {(data.status_log || []).length ? <ol className="sc-wo-status-log">{data.status_log!.map((entry: any) => <li key={entry.id}><i /><div><strong>{label(entry.status)}</strong><span>{entry.comment || "Status updated"}</span><small>{entry.employee_name || "System"}{entry.created_at ? ` · ${entry.created_at}` : ""}</small></div></li>)}</ol> : <div className="sc-ops-empty"><strong>No status history returned</strong></div>}
          </section>
        </div>
      ) : null}
    </section>
  );
}