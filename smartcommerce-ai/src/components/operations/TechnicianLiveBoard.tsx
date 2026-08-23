import { AlertTriangle, Clock3, ExternalLink, Timer, UserRound, Wrench } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import TechnicianCompensationPanel from "./TechnicianCompensationPanel";
import "../../styles/technician-live-board.css";

type ActiveTask = {
  time_entry_id?: string | number;
  started_at?: string;
  technician_id?: string | number;
  technician_name?: string;
  task_id?: string | number;
  task_description?: string;
  allotted_minutes?: number | string;
  work_order_id?: string | number;
  wo_number?: string;
  elapsed_minutes?: number | string;
};

type Props = {
  tasks: ActiveTask[];
  onOpenWorkOrder?: (id: string) => void;
};

function duration(totalMinutes: number) {
  const safe = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return hours ? `${hours}h ${String(minutes).padStart(2, "0")}m` : `${minutes}m`;
}

export default function TechnicianLiveBoard({ tasks, onOpenWorkOrder }: Props) {
  const baselineAt = useRef(Date.now());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    baselineAt.current = Date.now();
    setNow(baselineAt.current);
  }, [tasks]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  const elapsedFor = (task: ActiveTask) => {
    const serverMinutes = Math.max(0, Number(task.elapsed_minutes || 0));
    return serverMinutes + Math.max(0, now - baselineAt.current) / 60000;
  };

  const summary = useMemo(() => {
    let over = 0;
    let elapsed = 0;
    tasks.forEach((task) => {
      const current = Math.max(0, Number(task.elapsed_minutes || 0)) + Math.max(0, now - baselineAt.current) / 60000;
      elapsed += current;
      const allowed = Number(task.allotted_minutes || 0);
      if (allowed > 0 && current > allowed) over += 1;
    });
    return { working: tasks.length, over, elapsed };
  }, [tasks, now]);

  return (
    <>
      <section className="sc-tech-live" aria-label="Live technician activity">
        <div className="sc-tech-live__metrics">
          <article><UserRound size={18} /><span>Technicians working</span><strong>{summary.working}</strong><small>Active task timers</small></article>
          <article><Timer size={18} /><span>Live labor time</span><strong>{duration(summary.elapsed)}</strong><small>Across active tasks</small></article>
          <article className={summary.over ? "is-warning" : undefined}><AlertTriangle size={18} /><span>Past allotted time</span><strong>{summary.over}</strong><small>Needs supervisor attention</small></article>
        </div>

        {!tasks.length ? (
          <div className="sc-ops-empty"><Clock3 size={20} /><strong>No technician timers are running</strong><p>The board stays empty until a technician starts a real repair task.</p></div>
        ) : (
          <div className="sc-tech-live__list">
            {tasks.map((task, index) => {
              const elapsed = elapsedFor(task);
              const allowed = Math.max(0, Number(task.allotted_minutes || 0));
              const over = allowed > 0 && elapsed > allowed;
              const progress = allowed > 0 ? Math.min(100, (elapsed / allowed) * 100) : 0;
              const workOrderId = task.work_order_id == null ? "" : String(task.work_order_id);
              return (
                <article key={String(task.time_entry_id ?? task.task_id ?? index)} className={over ? "is-over" : undefined}>
                  <div className="sc-tech-live__identity">
                    <span className="sc-tech-live__pulse" aria-hidden="true" />
                    <div><small>Technician</small><strong>{task.technician_name || "Unnamed technician"}</strong><em>Working now</em></div>
                  </div>
                  <div className="sc-tech-live__task">
                    <Wrench size={16} aria-hidden="true" />
                    <div><small>{task.wo_number || "Work order"}</small><strong>{task.task_description || `Task ${task.task_id || ""}`}</strong></div>
                  </div>
                  <div className="sc-tech-live__time">
                    <div><small>Elapsed</small><strong>{duration(elapsed)}</strong><span>{allowed > 0 ? `of ${duration(allowed)} allotted` : "No time target"}</span></div>
                    {allowed > 0 ? <div className="sc-tech-live__bar" aria-label={`${Math.round(progress)} percent of allotted time`}><i style={{ width: `${progress}%` }} /></div> : null}
                    {over ? <em><AlertTriangle size={13} />{duration(elapsed - allowed)} over target</em> : null}
                  </div>
                  {workOrderId && onOpenWorkOrder ? <button type="button" onClick={() => onOpenWorkOrder(workOrderId)} aria-label={`Open ${task.wo_number || "work order"}`}><ExternalLink size={17} /></button> : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
      <TechnicianCompensationPanel />
    </>
  );
}
