import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Loader2, LogIn, LogOut, RefreshCw, ShieldCheck, Wrench } from "lucide-react";
import OperationsWorkspace from "../components/operations/OperationsWorkspace";
import {
  getStaffSession,
  listActiveTechnicianTasks,
  listActiveWorkOrders,
  listAwaitingPaymentWorkOrders,
  loginStaff,
  logoutStaff,
  type OperationsApiError,
  type StaffIdentity,
} from "../lib/staffOperations";
import "../styles/operations-workspace.css";

type OperationsSection = "overview" | "pos" | "repairs" | "technicians" | "inventory" | "purchasing" | "quotes" | "reports";

type DashboardState = {
  activeWorkOrders: any[];
  awaitingPayment: any[];
  activeTasks: any[];
};

const emptyDashboard: DashboardState = { activeWorkOrders: [], awaitingPayment: [], activeTasks: [] };

function staffName(staff: StaffIdentity) {
  const name = [staff.firstName, staff.lastName].filter(Boolean).join(" ").trim();
  return name || staff.username;
}

function StaffSignIn({ onSignedIn }: { onSignedIn: (staff: StaffIdentity) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await loginStaff({ username: username.trim(), password });
      if (!result.staff) throw new Error("The POS did not return a staff identity.");
      onSignedIn(result.staff);
    } catch (error) {
      const apiError = error as OperationsApiError;
      setMessage(apiError.status === 503
        ? "Staff sign-in is not configured for this environment yet."
        : apiError.message || "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sc-ops-auth">
      <section className="sc-ops-auth__card" aria-labelledby="staff-sign-in-title">
        <div className="sc-ops-auth__mark"><ShieldCheck size={26} aria-hidden="true" /></div>
        <span>Total Tools Jamaica</span>
        <h1 id="staff-sign-in-title">Staff operations</h1>
        <p>Sign in with your POS employee credentials. Access is controlled by your existing Total Tools security group.</p>
        <form onSubmit={submit}>
          <label>Username<input data-guide-id="staff-username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label>
          <label>Password<input data-guide-id="staff-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
          <button data-guide-id="staff-sign-in" type="submit" disabled={busy}>{busy ? <><Loader2 size={17} /> Signing in…</> : <><LogIn size={17} /> Sign in</>}</button>
          {message ? <p className="sc-ops-auth__status" role="alert"><AlertTriangle size={16} /> {message}</p> : null}
        </form>
      </section>
    </div>
  );
}

export default function OperationsPage() {
  const [staff, setStaff] = useState<StaffIdentity | null>(null);
  const [checking, setChecking] = useState(true);
  const [section, setSection] = useState<OperationsSection>("overview");
  const [dashboard, setDashboard] = useState<DashboardState>(emptyDashboard);
  const [loadingData, setLoadingData] = useState(false);
  const [dataMessage, setDataMessage] = useState("");

  useEffect(() => {
    let active = true;
    getStaffSession()
      .then((state) => { if (active) setStaff(state.staff); })
      .catch(() => { if (active) setStaff(null); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);

  async function refresh() {
    if (!staff || loadingData) return;
    setLoadingData(true);
    setDataMessage("");
    try {
      const [activeWorkOrders, awaitingPayment, activeTasks] = await Promise.all([
        listActiveWorkOrders(),
        listAwaitingPaymentWorkOrders(),
        listActiveTechnicianTasks(),
      ]);
      setDashboard({ activeWorkOrders, awaitingPayment, activeTasks });
    } catch (error) {
      const apiError = error as OperationsApiError;
      setDataMessage(apiError.status === 403
        ? "Your security group does not permit one or more dashboard resources."
        : apiError.status === 503
          ? "The connected POS is not available in this environment yet."
          : apiError.message || "Operations data could not be loaded.");
    } finally {
      setLoadingData(false);
    }
  }

  useEffect(() => { if (staff) void refresh(); }, [staff]);

  const overdue = useMemo(() => dashboard.activeWorkOrders.filter((workOrder) => Number(workOrder?.days_past_pickup_due || 0) > 0).length, [dashboard.activeWorkOrders]);
  const employeeLabel = staff ? staffName(staff) : undefined;

  if (checking) {
    return <div className="sc-ops-auth"><div className="sc-ops-auth__loading" role="status"><Loader2 size={24} /> Checking staff access…</div></div>;
  }
  if (!staff) return <StaffSignIn onSignedIn={setStaff} />;

  async function signOut() {
    try { await logoutStaff(); } finally { setStaff(null); setDashboard(emptyDashboard); }
  }

  return (
    <OperationsWorkspace
      section={section}
      title={section === "overview" ? "Operations command center" : section[0].toUpperCase() + section.slice(1)}
      description="Live retail, repair and service operations from the connected Total Tools POS."
      branchLabel={staff.defaultBranchName || staff.defaultBranchId || "Assigned branches"}
      employeeLabel={employeeLabel}
      onNavigate={setSection}
    >
      <div className="sc-ops-toolbar">
        <span><ShieldCheck size={16} /> {staff.securityGroupName || staff.role || "Staff"}</span>
        <div>
          <button type="button" onClick={refresh} disabled={loadingData}><RefreshCw size={16} /> Refresh</button>
          <button type="button" onClick={signOut}><LogOut size={16} /> Sign out</button>
        </div>
      </div>

      {section === "overview" ? (
        <>
          <div className="sc-ops-metrics" aria-label="Operations summary">
            <article><span>Active work orders</span><strong>{dashboard.activeWorkOrders.length}</strong><small><Wrench size={14} /> In service workflow</small></article>
            <article><span>Awaiting payment</span><strong>{dashboard.awaitingPayment.length}</strong><small><Clock3 size={14} /> Assessment, deposit or pickup</small></article>
            <article><span>Technicians working</span><strong>{dashboard.activeTasks.length}</strong><small><CheckCircle2 size={14} /> Live task timers</small></article>
            <article><span>Past pickup due</span><strong>{overdue}</strong><small><AlertTriangle size={14} /> Needs attention</small></article>
          </div>
          {dataMessage ? <div className="sc-ops-notice" role="status"><AlertTriangle size={17} /><span>{dataMessage}</span></div> : null}
          <section className="sc-ops-panel" data-guide-id="operations-active-work-orders">
            <header><div><span>Service floor</span><h2>Active work orders</h2></div><strong>{loadingData ? "Refreshing…" : `${dashboard.activeWorkOrders.length} open`}</strong></header>
            {dashboard.activeWorkOrders.length ? (
              <div className="sc-ops-list">
                {dashboard.activeWorkOrders.slice(0, 12).map((workOrder) => (
                  <article key={String(workOrder.id)}>
                    <div><strong>{workOrder.wo_number || `Work order ${workOrder.id}`}</strong><span>{workOrder.customer_name || "Customer"}</span></div>
                    <div><span>{workOrder.status || "active"}</span><small>{workOrder.branch_name || "Branch not supplied"}</small></div>
                  </article>
                ))}
              </div>
            ) : <p className="sc-ops-empty">{loadingData ? "Loading live work orders…" : "No active work orders were returned by the connected POS."}</p>}
          </section>
        </>
      ) : (
        <section className="sc-ops-panel">
          <header><div><span>Total Tools Operations</span><h2>{section[0].toUpperCase() + section.slice(1)}</h2></div></header>
          <p className="sc-ops-empty">This workspace is permission-gated and ready for the next live module connection. No placeholder operational records are generated.</p>
        </section>
      )}
    </OperationsWorkspace>
  );
}
