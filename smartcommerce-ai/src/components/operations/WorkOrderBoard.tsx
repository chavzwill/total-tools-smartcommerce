import { AlertTriangle, CalendarClock, ChevronRight, CircleDollarSign, Search, UserRound, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import "../../styles/work-order-board.css";

export type WorkOrderRow = {
  id?: string | number;
  wo_number?: string;
  status?: string;
  customer_name?: string;
  customer_phone?: string;
  employee_name?: string;
  branch_name?: string;
  equipment_name?: string;
  item_description?: string;
  problem_description?: string;
  pickup_due_date?: string;
  created_at?: string;
  days_past_pickup_due?: number | string;
  parts_total?: number | string;
  assessment_fee?: number | string;
  total?: number | string;
};

type Props = {
  rows: WorkOrderRow[];
  currency?: string;
  onOpen?: (id: string) => void;
};

const humanStatus = (value?: string) => (value || "unknown")
  .replace(/_/g, " ")
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const statusGroup = (status?: string) => {
  const value = (status || "").toLowerCase();
  if (["intake", "pending_deposit"].includes(value)) return "intake";
  if (["in_progress", "assessment_paid", "approved"].includes(value)) return "active";
  if (["awaiting_signoff"].includes(value)) return "signoff";
  if (["awaiting_pickup"].includes(value)) return "pickup";
  return "other";
};

function money(value: unknown, currency: string) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "—";
  try { return new Intl.NumberFormat("en-JM", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount); }
  catch { return `${currency} ${amount.toFixed(2)}`; }
}

function dueLabel(row: WorkOrderRow) {
  const days = Number(row.days_past_pickup_due || 0);
  if (Number.isFinite(days) && days > 0) return `${Math.ceil(days)}d past pickup due`;
  if (!row.pickup_due_date) return "No pickup date";
  const date = new Date(row.pickup_due_date);
  return Number.isNaN(date.getTime()) ? String(row.pickup_due_date) : `Pickup ${date.toLocaleDateString("en-JM", { month: "short", day: "numeric" })}`;
}

export default function WorkOrderBoard({ rows, currency = "JMD", onOpen }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter !== "all" && statusGroup(row.status) !== filter) return false;
      if (!needle) return true;
      return [row.wo_number, row.customer_name, row.customer_phone, row.employee_name, row.branch_name, row.equipment_name, row.item_description, row.problem_description, row.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [rows, query, filter]);

  const counts = useMemo(() => ({
    all: rows.length,
    intake: rows.filter((row) => statusGroup(row.status) === "intake").length,
    active: rows.filter((row) => statusGroup(row.status) === "active").length,
    signoff: rows.filter((row) => statusGroup(row.status) === "signoff").length,
    pickup: rows.filter((row) => statusGroup(row.status) === "pickup").length,
  }), [rows]);

  return (
    <section className="sc-work-orders" aria-label="Repair work orders">
      <div className="sc-work-orders__toolbar">
        <div className="sc-work-orders__search">
          <Search size={18} aria-hidden="true" />
          <label className="tt-sr-only" htmlFor="ops-work-order-search">Search repair work orders</label>
          <input id="ops-work-order-search" data-guide-id="work-orders-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search work order, customer, equipment or technician…" />
        </div>
        <div className="sc-work-orders__filters" aria-label="Filter work orders">
          {([
            ["all", "All"], ["intake", "Intake"], ["active", "In progress"], ["signoff", "Sign-off"], ["pickup", "Pickup"],
          ] as const).map(([id, label]) => (
            <button key={id} type="button" className={filter === id ? "is-active" : undefined} onClick={() => setFilter(id)} aria-pressed={filter === id}>
              {label}<span>{counts[id]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="sc-work-orders__summary" aria-live="polite">
        <strong>{filtered.length}</strong>
        <span>{filtered.length === 1 ? "work order" : "work orders"} shown</span>
        {query ? <small>matching “{query}”</small> : null}
      </div>

      {filtered.length === 0 ? (
        <div className="sc-ops-empty"><Wrench size={20} /><strong>No work orders match this view</strong><p>Change the filter or search. SmartCommerce does not insert sample repair records.</p></div>
      ) : (
        <div className="sc-work-orders__list">
          {filtered.map((row, index) => {
            const id = String(row.id ?? row.wo_number ?? index);
            const late = Number(row.days_past_pickup_due || 0) > 0;
            const equipment = row.equipment_name || row.item_description || row.problem_description || "Equipment repair";
            return (
              <article key={id} className={`sc-work-order-row${late ? " is-overdue" : ""}`} data-guide-id={index === 0 ? "work-order-first" : undefined}>
                <div className="sc-work-order-row__identity">
                  <span className={`sc-work-order-status is-${statusGroup(row.status)}`}>{humanStatus(row.status)}</span>
                  <strong>{row.wo_number || `Work order ${id}`}</strong>
                  <p>{equipment}</p>
                </div>
                <div className="sc-work-order-row__customer">
                  <UserRound size={16} aria-hidden="true" />
                  <span><small>Customer</small><strong>{row.customer_name || "Customer not named"}</strong>{row.customer_phone ? <em>{row.customer_phone}</em> : null}</span>
                </div>
                <div className="sc-work-order-row__owner">
                  <Wrench size={16} aria-hidden="true" />
                  <span><small>Assigned</small><strong>{row.employee_name || "Unassigned"}</strong><em>{row.branch_name || "Branch not set"}</em></span>
                </div>
                <div className={`sc-work-order-row__due${late ? " is-late" : ""}`}>
                  {late ? <AlertTriangle size={16} aria-hidden="true" /> : <CalendarClock size={16} aria-hidden="true" />}
                  <span><small>Pickup</small><strong>{dueLabel(row)}</strong></span>
                </div>
                <div className="sc-work-order-row__money">
                  <CircleDollarSign size={16} aria-hidden="true" />
                  <span><small>Parts / value</small><strong>{money(row.parts_total ?? row.total ?? row.assessment_fee, currency)}</strong></span>
                </div>
                <button type="button" className="sc-work-order-row__open" onClick={() => onOpen?.(id)} disabled={!onOpen} aria-label={`Open ${row.wo_number || `work order ${id}`}`}>
                  <ChevronRight size={19} aria-hidden="true" />
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
