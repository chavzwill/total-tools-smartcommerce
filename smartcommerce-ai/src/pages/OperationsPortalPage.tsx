import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2, LogIn, LogOut, RefreshCw, ShieldCheck, Wrench } from "lucide-react";
import GuidedMode from "../components/guidance/GuidedMode";
import CashDrawerLifecyclePanel from "../components/operations/CashDrawerLifecyclePanel";
import ERPIntelligenceBoard from "../components/operations/ERPIntelligenceBoard";
import IntegrationReviewCenter from "../components/operations/IntegrationReviewCenter";
import InventoryControlBoard from "../components/operations/InventoryControlBoard";
import InventoryIntegrityPanel from "../components/operations/InventoryIntegrityPanel";
import OmnichannelReportingPanel from "../components/operations/OmnichannelReportingPanel";
import OperationsWorkspace, { type OperationsSection } from "../components/operations/OperationsWorkspace";
import PointOfSaleWorkspace from "../components/operations/PointOfSaleWorkspace";
import QuotationWorkspace from "../components/operations/QuotationWorkspace";
import ReportingCenter from "../components/operations/ReportingCenter";
import SupplyChainBoard from "../components/operations/SupplyChainBoard";
import TechnicianLiveBoard from "../components/operations/TechnicianLiveBoard";
import TransactionServicePanel from "../components/operations/TransactionServicePanel";
import WorkflowHandoffBanner from "../components/operations/WorkflowHandoffBanner";
import WorkOrderBoard, { type WorkOrderRow } from "../components/operations/WorkOrderBoard";
import WorkOrderDetailPanel from "../components/operations/WorkOrderDetailPanel";
import {
  getStaffSession,
  listActiveTechnicianTasks,
  listActiveWorkOrders,
  listAwaitingPaymentWorkOrders,
  loginStaff,
  logoutStaff,
  operationsRequest,
  type OperationsApiError,
  type StaffIdentity,
} from "../lib/staffOperations";
import "../styles/operations-workspace.css";

type ResourceState = { loading: boolean; data?: unknown; error?: string };
type DashboardState = { activeWorkOrders: any[]; awaitingPayment: any[]; activeTasks: any[] };
type IntakeRow = Record<string, any>;

const emptyDashboard: DashboardState = { activeWorkOrders: [], awaitingPayment: [], activeTasks: [] };
const sectionResource: Partial<Record<OperationsSection, string>> = {
  repairs: "work-orders?view=active",
  technicians: "work-orders/active-tasks",
  rentals: "rentals",
  inventory: "inventory",
};

function hasPermission(staff: StaffIdentity, key: string, parent?: string) {
  if (Object.prototype.hasOwnProperty.call(staff.permissions, key)) return staff.permissions[key] === true;
  return parent ? staff.permissions[parent] === true : staff.permissions[key] === true;
}
function hasPermissionFamily(staff: StaffIdentity, key: string) {
  return staff.permissions[key] === true || Object.entries(staff.permissions).some(([permission, enabled]) => enabled && permission.startsWith(`${key}_`));
}
function canReviewIntegrations(staff: StaffIdentity) {
  return ["reports", "quotations", "purchase_requests", "purchasing", "inventory", "rentals", "work_orders", "customers", "pos"].some((key) => hasPermissionFamily(staff, key));
}
function can(staff: StaffIdentity, section: OperationsSection) {
  if (section === "overview") return true;
  if (section === "intelligence") return ["reports", "inventory", "purchasing", "purchase_requests", "work_orders"].some((key) => hasPermissionFamily(staff, key));
  if (section === "reviews") return canReviewIntegrations(staff);
  const key: Record<Exclude<OperationsSection, "overview" | "intelligence" | "reviews">, string> = {
    pos: "pos", repairs: "work_orders", technicians: "work_orders", rentals: "rentals", inventory: "inventory",
    purchasing: "purchasing", quotes: "quotations", reports: "reports",
  };
  return hasPermissionFamily(staff, key[section]);
}
function listFromPayload(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  const row = value as Record<string, unknown>;
  for (const key of ["items", "rows", "data", "agreements", "rentals", "work_orders", "transactions", "products"]) if (Array.isArray(row[key])) return row[key] as unknown[];
  return [];
}

export default function OperationsPortalPage() {
  const [staff, setStaff] = useState<StaffIdentity | null>(null);
  const [checking, setChecking] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [authError, setAuthError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [section, setSection] = useState<OperationsSection>("overview");
  const [resource, setResource] = useState<ResourceState>({ loading: false });
  const [dashboard, setDashboard] = useState<DashboardState>(emptyDashboard);
  const [dashboardError, setDashboardError] = useState("");
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<string | null>(null);
  const [activeHandoff, setActiveHandoff] = useState<IntakeRow | null>(null);

  const employeeLabel = useMemo(() => !staff ? "" : [staff.firstName, staff.lastName].filter(Boolean).join(" ") || staff.username, [staff]);
  const allowedSections = useMemo(() => {
    if (!staff) return ["overview"] as OperationsSection[];
    return (["overview", "intelligence", "pos", "repairs", "technicians", "rentals", "inventory", "purchasing", "quotes", "reviews", "reports"] as OperationsSection[]).filter((candidate) => can(staff, candidate));
  }, [staff]);

  const loadSession = useCallback(async () => { try { const state = await getStaffSession(); setStaff(state.authenticated ? state.staff : null); } catch { setStaff(null); } finally { setChecking(false); } }, []);
  useEffect(() => { void loadSession(); }, [loadSession]);

  const loadDashboard = useCallback(async () => {
    if (!staff || !can(staff, "repairs")) return;
    setDashboardError("");
    try {
      const [activeWorkOrders, awaitingPayment, activeTasks] = await Promise.all([listActiveWorkOrders(), listAwaitingPaymentWorkOrders(), listActiveTechnicianTasks()]);
      setDashboard({ activeWorkOrders, awaitingPayment, activeTasks });
    } catch (error) {
      const apiError = error as OperationsApiError;
      setDashboardError(apiError.status === 403 ? "Your security group restricts part of the service dashboard." : apiError.message);
    }
  }, [staff]);
  useEffect(() => { if (staff) void loadDashboard(); }, [staff, loadDashboard]);

  const loadResource = useCallback(async (nextSection: OperationsSection) => {
    const path = sectionResource[nextSection];
    if (!path) { setResource({ loading: false }); return; }
    setResource({ loading: true });
    try { setResource({ loading: false, data: await operationsRequest<unknown>(path) }); }
    catch (error) { setResource({ loading: false, error: (error as OperationsApiError).message || "The POS resource could not be loaded." }); }
  }, []);
  useEffect(() => { setSelectedWorkOrder(null); if (staff && section !== "overview") void loadResource(section); }, [staff, section, loadResource]);

  async function login(event: FormEvent) {
    event.preventDefault(); if (submitting) return; setSubmitting(true); setAuthError("");
    try { const state = await loginStaff({ username: username.trim(), ...(password ? { password } : { pin }) }); if (!state.staff) throw new Error("Staff sign-in failed."); setStaff(state.staff); setPassword(""); setPin(""); setSection("overview"); setActiveHandoff(null); }
    catch (error) { setAuthError((error as OperationsApiError).message || "Staff sign-in failed."); }
    finally { setSubmitting(false); }
  }
  async function logout() { await logoutStaff().catch(() => undefined); setStaff(null); setSection("overview"); setResource({ loading: false }); setDashboard(emptyDashboard); setSelectedWorkOrder(null); setActiveHandoff(null); }

  function routeHandoff(nextSection: OperationsSection, row: IntakeRow) {
    setActiveHandoff(row);
    setSection(nextSection);
  }

  if (checking) return <div className="sc-ops-auth-state"><Loader2 className="sc-ops-spin" size={26} /><strong>Checking staff access…</strong></div>;
  if (!staff) return <div className="sc-ops-login-page"><section className="sc-ops-login-card" aria-labelledby="staff-login-title"><div className="sc-ops-login-brand"><span>Total Tools Jamaica</span><strong>Operations</strong></div><ShieldCheck size={28} aria-hidden="true" /><h1 id="staff-login-title">Staff sign in</h1><p>Use your existing POS employee credentials. Access follows your assigned Total Tools security group.</p><form onSubmit={login}><label>Username<input data-guide-id="staff-username" required autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /></label><label>Password<input data-guide-id="staff-password" type="password" autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); if (event.target.value) setPin(""); }} placeholder="Use password or PIN" /></label><div className="sc-ops-login-or"><span>or</span></div><label>PIN<input data-guide-id="staff-pin" inputMode="numeric" value={pin} onChange={(event) => { setPin(event.target.value.replace(/\D/g, "").slice(0, 20)); if (event.target.value) setPassword(""); }} placeholder="Employee PIN" /></label>{authError ? <p className="sc-ops-login-error" role="alert"><AlertCircle size={16} />{authError}</p> : null}<button data-guide-id="staff-sign-in" className="sc-button sc-button--primary" type="submit" disabled={submitting || !username || (!password && !pin)}><LogIn size={17} />{submitting ? "Signing in…" : "Sign in to Operations"}</button></form></section><GuidedMode /></div>;

  const items = listFromPayload(resource.data);
  const title: Record<OperationsSection, string> = {
    overview: "Operations command center", intelligence: "ERP Intelligence", pos: "Point of sale", repairs: "Repair work orders", technicians: "Technician workspace", rentals: "Rental operations", inventory: "Inventory control", purchasing: "Purchasing", quotes: "Quotations", reviews: "Omnichannel Review & Approvals", reports: "Reporting & Audit Center",
  };
  const overdue = dashboard.activeWorkOrders.filter((row) => Number(row?.days_past_pickup_due || 0) > 0).length;
  const showHandoff = activeHandoff && section === activeHandoff.destination_section && section !== "reviews";

  return <><OperationsWorkspace section={section} title={selectedWorkOrder && section === "repairs" ? "Work order detail" : title[section]}
    description={section === "intelligence" ? "Evidence-driven operational intelligence across Total Tools" : section === "pos" ? "Fast, stock-aware checkout using the live Total Tools POS" : section === "rentals" ? "Live rental agreements and post-approval rental workflow destination" : section === "quotes" ? "Commercial quoting, sourcing and conversion using live POS inventory" : section === "inventory" ? "Stock health, physical counts, bin evidence and controlled inventory adjustments" : section === "reviews" ? "Review, authorize and route website, app and SmartCommerce exports into their operational destinations" : section === "reports" ? "Report every operational event across POS, website, apps and connected systems, with controlled exports and print-ready views" : staff.securityGroupName ? `${staff.securityGroupName} access` : "Permission-aware staff workspace"}
    branchLabel={staff.defaultBranchName || staff.defaultBranchId || "Assigned branch"} employeeLabel={employeeLabel} allowedSections={allowedSections} onNavigate={(next) => { setSection(next); if (next === "reviews") setActiveHandoff(null); }}
    actions={<button type="button" className="sc-ops-signout" onClick={logout}><LogOut size={16} />Sign out</button>}>
    {showHandoff ? <WorkflowHandoffBanner row={activeHandoff!} onReturn={() => { setActiveHandoff(null); setSection("reviews"); }} onResolved={() => { setActiveHandoff(null); setSection("reviews"); }} /> : null}
    {section === "overview" ? <><div className="sc-ops-metrics"><article><span>Active work orders</span><strong>{dashboard.activeWorkOrders.length}</strong><small>Live service workflow</small></article><article><span>Awaiting payment</span><strong>{dashboard.awaitingPayment.length}</strong><small>Assessment, deposit or pickup</small></article><article><span>Technicians working</span><strong>{dashboard.activeTasks.length}</strong><small>Open task timers</small></article><article><span>Past pickup due</span><strong>{overdue}</strong><small>Needs attention</small></article></div>{dashboardError ? <div className="sc-ops-empty is-error"><AlertCircle size={20} /><strong>Live dashboard partially unavailable</strong><p>{dashboardError}</p><button className="sc-button sc-button--secondary" onClick={loadDashboard}><RefreshCw size={16} />Retry</button></div> : null}<div className="sc-ops-dashboard-grid"><article><Wrench size={20} /><span>Repair operations</span><strong>{can(staff, "repairs") ? "Connected" : "Restricted"}</strong><p>Work orders, technician tasks, payment holds and overdue pickup state are read from the POS.</p></article><article><ShieldCheck size={20} /><span>Security group</span><strong>{staff.securityGroupName || staff.role || "Staff"}</strong><p>Both navigation and API operations enforce your POS permissions.</p></article></div></> :
    section === "intelligence" ? <ERPIntelligenceBoard /> :
    section === "pos" ? <><PointOfSaleWorkspace staff={staff} /><CashDrawerLifecyclePanel staff={staff} /><TransactionServicePanel staff={staff} /></> :
    section === "quotes" ? <QuotationWorkspace staff={staff} /> :
    section === "reviews" ? <IntegrationReviewCenter staff={staff} onNavigate={setSection} onRoute={routeHandoff} /> :
    section === "reports" ? <><ReportingCenter staff={staff} /><OmnichannelReportingPanel /></> :
    selectedWorkOrder && section === "repairs" ? <WorkOrderDetailPanel workOrderId={selectedWorkOrder} onClose={() => setSelectedWorkOrder(null)} staffEmployeeId={staff.employeeId} canManageTasks={hasPermission(staff, "wo_technician", "work_orders")} canAssess={hasPermission(staff, "wo_assess", "work_orders")} canAssignParts={hasPermission(staff, "wo_assign_parts", "work_orders")} /> :
    resource.loading ? <div className="sc-ops-auth-state"><Loader2 className="sc-ops-spin" size={22} /><strong>Loading live POS data…</strong></div> :
    resource.error ? <div className="sc-ops-empty is-error"><AlertCircle size={20} /><strong>Live POS data unavailable</strong><p>{resource.error}</p><button className="sc-button sc-button--secondary" type="button" onClick={() => loadResource(section)}><RefreshCw size={16} />Retry</button></div> :
    section === "repairs" ? <WorkOrderBoard rows={items as WorkOrderRow[]} currency="JMD" onOpen={setSelectedWorkOrder} /> :
    section === "technicians" ? <TechnicianLiveBoard tasks={items as any[]} onOpenWorkOrder={(id) => { setSection("repairs"); window.setTimeout(() => setSelectedWorkOrder(id), 0); }} /> :
    section === "inventory" ? <><InventoryControlBoard rows={items as Record<string, any>[]} onRefresh={() => void loadResource("inventory")} /><InventoryIntegrityPanel products={items as Record<string, any>[]} onInventoryRefresh={() => void loadResource("inventory")} /></> :
    section === "purchasing" ? <SupplyChainBoard employeeId={staff.employeeId} /> :
    <div className="sc-ops-live-resource"><div className="sc-ops-live-resource__summary"><span>Connected POS records</span><strong>{items.length}</strong><small>{section === "rentals" ? "Use the live rental record to continue verification, issue, return and settlement through authorized controls." : "No sample records are added by SmartCommerce."}</small></div><pre aria-label={`${title[section]} live data preview`}>{JSON.stringify(items.slice(0, 10), null, 2)}</pre></div>}
  </OperationsWorkspace><GuidedMode /></>;
}
