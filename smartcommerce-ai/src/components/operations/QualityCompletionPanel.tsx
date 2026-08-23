import { AlertCircle, BellRing, CheckCircle2, ClipboardCheck, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getStaffSession, operationsRequest, type OperationsApiError } from "../../lib/staffOperations";
import "../../styles/quality-completion.css";

type Props = {
  workOrder: Record<string, any>;
  staffEmployeeId?: string;
  canSignOff?: boolean;
  canNotify?: boolean;
  onUpdated: () => Promise<void> | void;
};

const label = (value: unknown) => String(value || "—").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function QualityCompletionPanel({ workOrder, staffEmployeeId, canSignOff = false, canNotify = false, onUpdated }: Props) {
  const [sessionPermissions, setSessionPermissions] = useState<Record<string, boolean>>({});
  const [comment, setComment] = useState("");
  const [notifyMethod, setNotifyMethod] = useState<"email" | "phone">("email");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void getStaffSession().then((state) => {
      if (active && state.staff?.permissions) setSessionPermissions(state.staff.permissions);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const effectiveCanSignOff = canSignOff || sessionPermissions.wo_signoff === true;
  const effectiveCanNotify = canNotify || sessionPermissions.work_orders === true;
  const tasks = Array.isArray(workOrder.tasks) ? workOrder.tasks : [];
  const incompleteTasks = useMemo(() => tasks.filter((task: any) => task.status !== "complete"), [tasks]);
  const runningTasks = useMemo(() => tasks.filter((task: any) => Boolean(task.open_time_entry_id)), [tasks]);
  const readyForSignoff = effectiveCanSignOff && ["in_progress", "awaiting_signoff"].includes(String(workOrder.status)) && tasks.length > 0 && incompleteTasks.length === 0 && runningTasks.length === 0;
  const readyToNotify = effectiveCanNotify && String(workOrder.status) === "complete";

  async function signOff() {
    if (!readyForSignoff || busy) return;
    setBusy("signoff"); setError("");
    try {
      await operationsRequest(`work-orders/${encodeURIComponent(String(workOrder.id))}/signoff`, {
        method: "PATCH",
        body: JSON.stringify({ employee_id: staffEmployeeId || null, comment: comment.trim() || "Quality control completed and signed off by supervisor" }),
      });
      setComment("");
      await onUpdated();
    } catch (cause) {
      setError((cause as OperationsApiError).message || "Supervisor sign-off could not be completed.");
    } finally { setBusy(null); }
  }

  async function notifyCustomer() {
    if (!readyToNotify || busy) return;
    setBusy("notify"); setError("");
    try {
      await operationsRequest(`work-orders/${encodeURIComponent(String(workOrder.id))}/notify`, {
        method: "PATCH",
        body: JSON.stringify({ notification_method: notifyMethod, employee_id: staffEmployeeId || null }),
      });
      await onUpdated();
    } catch (cause) {
      setError((cause as OperationsApiError).message || "Customer notification could not be recorded.");
    } finally { setBusy(null); }
  }

  return <section className="sc-quality-completion" aria-label="Quality control and completion" data-guide-id="repair-quality-completion">
    <div className="sc-quality-completion__heading"><ClipboardCheck size={19}/><div><span>Quality & completion</span><strong>Supervisor release control</strong></div><em>{label(workOrder.status)}</em></div>
    {error ? <div className="sc-quality-completion__error" role="alert"><AlertCircle size={15}/>{error}</div> : null}
    <div className="sc-quality-completion__gates">
      <article className={tasks.length ? "is-good" : "is-blocked"}><ShieldCheck size={17}/><div><span>Repair tasks</span><strong>{tasks.length ? `${tasks.length} recorded` : "No tasks"}</strong></div></article>
      <article className={incompleteTasks.length === 0 && tasks.length ? "is-good" : "is-blocked"}><CheckCircle2 size={17}/><div><span>Task completion</span><strong>{incompleteTasks.length ? `${incompleteTasks.length} incomplete` : tasks.length ? "All complete" : "Waiting"}</strong></div></article>
      <article className={runningTasks.length === 0 ? "is-good" : "is-blocked"}><CheckCircle2 size={17}/><div><span>Active timers</span><strong>{runningTasks.length ? `${runningTasks.length} running` : "None open"}</strong></div></article>
    </div>

    {["in_progress", "awaiting_signoff"].includes(String(workOrder.status)) ? <div className="sc-quality-completion__signoff">
      <div><strong>Supervisor quality sign-off</strong><span>The POS will not release this repair until every technician task is complete.</span></div>
      <textarea rows={3} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="QC result, test performed, release notes or exception details" data-guide-id="repair-qc-comment"/>
      <button type="button" disabled={!readyForSignoff || busy === "signoff"} onClick={() => void signOff()} data-guide-id="repair-qc-signoff"><CheckCircle2 size={16}/>{busy === "signoff" ? "Signing off…" : "Sign off repair"}</button>
      {!readyForSignoff ? <small>{!effectiveCanSignOff ? "Your security group does not include supervisor sign-off." : !tasks.length ? "Add repair tasks before sign-off." : incompleteTasks.length ? "Complete every repair task before sign-off." : runningTasks.length ? "Stop all task timers before sign-off." : "This repair is not ready for sign-off."}</small> : null}
    </div> : null}

    {String(workOrder.status) === "complete" ? <div className="sc-quality-completion__notify">
      <div><BellRing size={17}/><div><strong>Release to customer</strong><span>Record how the customer was notified that the repair is ready for pickup.</span></div></div>
      <label>Notification method<select value={notifyMethod} onChange={(event) => setNotifyMethod(event.target.value as "email" | "phone")}><option value="email">Email</option><option value="phone">Phone</option></select></label>
      <button type="button" disabled={!readyToNotify || busy === "notify"} onClick={() => void notifyCustomer()} data-guide-id="repair-customer-notify"><BellRing size={16}/>{busy === "notify" ? "Recording…" : "Mark customer notified"}</button>
    </div> : null}

    {["awaiting_pickup", "picked_up"].includes(String(workOrder.status)) ? <div className="sc-quality-completion__released"><CheckCircle2 size={18}/><div><strong>{workOrder.status === "picked_up" ? "Repair collected" : "Customer notified — awaiting pickup"}</strong><span>{workOrder.notification_method ? `Notification: ${label(workOrder.notification_method)}` : "Completion workflow recorded in the POS."}</span></div></div> : null}
  </section>;
}
