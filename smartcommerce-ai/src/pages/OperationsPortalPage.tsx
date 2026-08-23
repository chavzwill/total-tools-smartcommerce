import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2, LogIn, LogOut, RefreshCw, ShieldCheck, Wrench } from "lucide-react";
import GuidedMode from "../components/guidance/GuidedMode";
import OperationsWorkspace from "../components/operations/OperationsWorkspace";
import "../styles/operations-workspace.css";

type StaffSession = {
  employeeId: string;
  username: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  securityGroupName?: string;
  defaultBranchId?: string;
  defaultBranchName?: string;
  permissions: Record<string, boolean>;
};

type SessionResponse = { authenticated: boolean; staff: StaffSession | null; error?: { message?: string } };
type OpsSection = "overview" | "pos" | "repairs" | "technicians" | "inventory" | "purchasing" | "quotes" | "reports";

type ResourceState = {
  loading: boolean;
  data?: unknown;
  error?: string;
};

const sectionResource: Partial<Record<OpsSection, string>> = {
  repairs: "work_orders",
  technicians: "active_tasks",
  inventory: "inventory",
  purchasing: "purchase_orders",
  quotes: "quotations",
  reports: "transactions",
};

function can(staff: StaffSession, section: OpsSection) {
  if (section === "overview") return true;
  const key: Record<Exclude<OpsSection, "overview">, string> = {
    pos: "pos",
    repairs: "work_orders",
    technicians: "work_orders",
    inventory: "inventory",
    purchasing: "purchasing",
    quotes: "quotations",
    reports: "reports",
  };
  return staff.permissions[key[section]] === true || Object.entries(staff.permissions).some(([permission, enabled]) => enabled && permission.startsWith(`${key[section]}_`));
}

function listFromPayload(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  const row = value as Record<string, unknown>;
  for (const key of ["items", "rows", "data", "work_orders", "transactions", "products"]) {
    if (Array.isArray(row[key])) return row[key] as unknown[];
  }
  return [];
}

export default function OperationsPortalPage() {
  const [staff, setStaff] = useState<StaffSession | null>(null);
  const [checking, setChecking] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [authError, setAuthError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [section, setSection] = useState<OpsSection>("overview");
  const [resource, setResource] = useState<ResourceState>({ loading: false });

  const employeeLabel = useMemo(() => {
    if (!staff) return "";
    return [staff.firstName, staff.lastName].filter(Boolean).join(" ") || staff.username;
  }, [staff]);

  const allowedSections = useMemo(() => {
    if (!staff) return ["overview"] as OpsSection[];
    return (["overview", "pos", "repairs", "technicians", "inventory", "purchasing", "quotes", "reports"] as OpsSection[]).filter((candidate) => can(staff, candidate));
  }, [staff]);

  const loadSession = useCallback(async () => {
    try {
      const response = await fetch("/api/staff-session", { credentials: "same-origin", headers: { Accept: "application/json" } });
      const payload = await response.json() as SessionResponse;
      setStaff(payload.authenticated ? payload.staff : null);
    } catch {
      setStaff(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => { void loadSession(); }, [loadSession]);

  const loadResource = useCallback(async (nextSection: OpsSection) => {
    const resourceName = sectionResource[nextSection];
    if (!resourceName) {
      setResource({ loading: false });
      return;
    }
    setResource({ loading: true });
    try {
      const response = await fetch(`/api/pos-operations?resource=${encodeURIComponent(resourceName)}`, { credentials: "same-origin", headers: { Accept: "application/json" } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || "The POS resource could not be loaded.");
      setResource({ loading: false, data: payload?.data });
    } catch (error) {
      setResource({ loading: false, error: error instanceof Error ? error.message : "The POS resource could not be loaded." });
    }
  }, []);

  useEffect(() => {
    if (staff) void loadResource(section);
  }, [staff, section, loadResource]);

  async function login(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setAuthError("");
    try {
      const response = await fetch("/api/staff-session", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action: "login", username, ...(password ? { password } : { pin }) }),
      });
      const payload = await response.json() as SessionResponse;
      if (!response.ok || !payload.staff) throw new Error(payload.error?.message || "Staff sign-in failed.");
      setStaff(payload.staff);
      setPassword("");
      setPin("");
      setSection("overview");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Staff sign-in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    await fetch("/api/staff-session", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    }).catch(() => undefined);
    setStaff(null);
    setSection("overview");
    setResource({ loading: false });
  }

  if (checking) {
    return <div className="sc-ops-auth-state"><Loader2 className="sc-ops-spin" size={26} /><strong>Checking staff access…</strong></div>;
  }

  if (!staff) {
    return (
      <div className="sc-ops-login-page">
        <section className="sc-ops-login-card" aria-labelledby="staff-login-title">
          <div className="sc-ops-login-brand"><span>Total Tools Jamaica</span><strong>Operations</strong></div>
          <ShieldCheck size={28} aria-hidden="true" />
          <h1 id="staff-login-title">Staff sign in</h1>
          <p>Use your existing POS employee credentials. Access and navigation follow your assigned security group.</p>
          <form onSubmit={login}>
            <label>Username<input data-guide-id="staff-username" required autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
            <label>Password<input data-guide-id="staff-password" type="password" autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); if (event.target.value) setPin(""); }} placeholder="Use password or PIN" /></label>
            <div className="sc-ops-login-or"><span>or</span></div>
            <label>PIN<input data-guide-id="staff-pin" inputMode="numeric" value={pin} onChange={(event) => { setPin(event.target.value.replace(/\D/g, "").slice(0, 20)); if (event.target.value) setPassword(""); }} placeholder="Employee PIN" /></label>
            {authError ? <p className="sc-ops-login-error" role="alert"><AlertCircle size={16} />{authError}</p> : null}
            <button className="sc-button sc-button--primary" type="submit" disabled={submitting || !username || (!password && !pin)}><LogIn size={17} />{submitting ? "Signing in…" : "Sign in to Operations"}</button>
          </form>
        </section>
        <GuidedMode />
      </div>
    );
  }

  const items = listFromPayload(resource.data);
  const title: Record<OpsSection, string> = {
    overview: "Operations command center",
    pos: "Point of sale",
    repairs: "Repair work orders",
    technicians: "Technician workspace",
    inventory: "Inventory control",
    purchasing: "Purchasing",
    quotes: "Quotations",
    reports: "Reports & transactions",
  };

  return (
    <>
      <OperationsWorkspace
        section={section}
        title={title[section]}
        description={staff.securityGroupName ? `${staff.securityGroupName} access` : "Permission-aware staff workspace"}
        branchLabel={staff.defaultBranchName || staff.defaultBranchId || "Assigned branch"}
        employeeLabel={employeeLabel}
        allowedSections={allowedSections}
        onNavigate={(next) => setSection(next)}
        actions={<button type="button" className="sc-ops-signout" onClick={logout}><LogOut size={16} />Sign out</button>}
      >
        {section === "overview" ? (
          <div className="sc-ops-dashboard-grid">
            <article><Wrench size={20} /><span>Repair operations</span><strong>{can(staff, "repairs") ? "Available" : "Restricted"}</strong><p>Work orders, technician tasks, assessment, parts and sign-off.</p></article>
            <article><ShieldCheck size={20} /><span>Security group</span><strong>{staff.securityGroupName || staff.role || "Staff"}</strong><p>The portal hides operational areas you are not authorized to use.</p></article>
          </div>
        ) : section === "pos" ? (
          <div className="sc-ops-empty"><strong>POS transaction workspace foundation</strong><p>The transaction UI will be connected to the existing POS checkout flow next. No duplicate payment engine is being created.</p></div>
        ) : resource.loading ? (
          <div className="sc-ops-auth-state"><Loader2 className="sc-ops-spin" size={22} /><strong>Loading live POS data…</strong></div>
        ) : resource.error ? (
          <div className="sc-ops-empty is-error"><AlertCircle size={20} /><strong>Live POS data unavailable</strong><p>{resource.error}</p><button className="sc-button sc-button--secondary" type="button" onClick={() => loadResource(section)}><RefreshCw size={16} />Retry</button></div>
        ) : (
          <div className="sc-ops-live-resource">
            <div className="sc-ops-live-resource__summary"><span>Connected POS records</span><strong>{items.length}</strong><small>No sample records are added by SmartCommerce.</small></div>
            <pre aria-label={`${title[section]} live data preview`}>{JSON.stringify(items.slice(0, 10), null, 2)}</pre>
          </div>
        )}
      </OperationsWorkspace>
      <GuidedMode />
    </>
  );
}
