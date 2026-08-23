import { AlertTriangle, BrainCircuit, Clock3, PackageSearch, RefreshCw, ShieldCheck, Truck, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { operationsRequest, type OperationsApiError } from "../../lib/staffOperations";
import ConsolidatedPurchasePlan from "./ConsolidatedPurchasePlan";
import InventoryCapitalIntelligence from "./InventoryCapitalIntelligence";
import ReplenishmentDecisionBoard from "./ReplenishmentDecisionBoard";
import SmartTransferRecommendations from "./SmartTransferRecommendations";
import SupplierPurchaseIntelligence from "./SupplierPurchaseIntelligence";
import "../../styles/erp-intelligence.css";

type Row = Record<string, any>;
type Dataset = { rows: Row[]; available: boolean; reason?: string };
type IntelligenceState = {
  loading: boolean;
  inventory: Dataset;
  purchaseOrders: Dataset;
  workOrders: Dataset;
  activeTasks: Dataset;
  suppliers: Dataset;
};

const unavailable = (): Dataset => ({ rows: [], available: false });
const initialState: IntelligenceState = { loading: true, inventory: unavailable(), purchaseOrders: unavailable(), workOrders: unavailable(), activeTasks: unavailable(), suppliers: unavailable() };

function asRows(value: unknown): Row[] {
  if (Array.isArray(value)) return value as Row[];
  if (!value || typeof value !== "object") return [];
  const row = value as Record<string, unknown>;
  for (const key of ["rows", "items", "data", "products", "work_orders"]) if (Array.isArray(row[key])) return row[key] as Row[];
  return [];
}

function money(value: number) { return new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", maximumFractionDigits: 0 }).format(value || 0); }

async function loadDataset(path: string): Promise<Dataset> {
  try { return { rows: asRows(await operationsRequest<unknown>(path)), available: true }; }
  catch (error) { const apiError = error as OperationsApiError; return { rows: [], available: false, reason: apiError.status === 403 ? "Restricted by staff permissions" : apiError.message || "Unavailable" }; }
}

export default function ERPIntelligenceBoard() {
  const [state, setState] = useState<IntelligenceState>(initialState);

  async function load() {
    setState((current) => ({ ...current, loading: true }));
    const [inventory, purchaseOrders, workOrders, activeTasks, suppliers] = await Promise.all([
      loadDataset("inventory?limit=500"), loadDataset("purchase-orders?limit=250"), loadDataset("work-orders?view=active"), loadDataset("work-orders/active-tasks"), loadDataset("suppliers?active=true"),
    ]);
    setState({ loading: false, inventory, purchaseOrders, workOrders, activeTasks, suppliers });
  }

  useEffect(() => { void load(); }, []);

  const intelligence = useMemo(() => {
    const inventory = state.inventory.rows, purchaseOrders = state.purchaseOrders.rows, workOrders = state.workOrders.rows, activeTasks = state.activeTasks.rows, now = Date.now();
    const outOfStock = inventory.filter((row) => Number(row.stock_qty ?? row.stock ?? 0) <= 0).length;
    const lowStock = inventory.filter((row) => { const stock = Number(row.stock_qty ?? row.stock ?? 0), minimum = Number(row.min_stock ?? row.reorder_level ?? 0); return stock > 0 && minimum > 0 && stock <= minimum; }).length;
    const openPOs = purchaseOrders.filter((row) => !["received", "cancelled", "closed"].includes(String(row.status || "")));
    const overduePOs = openPOs.filter((row) => { const expected = new Date(String(row.expected_date || "")); return Number.isFinite(expected.getTime()) && expected.getTime() < now; });
    const purchasingExposure = openPOs.reduce((sum, row) => sum + Math.max(0, Number(row.total || 0)), 0);
    const overdueRepairs = workOrders.filter((row) => Number(row.days_past_pickup_due || 0) > 0).length;
    const laborOverruns = activeTasks.filter((row) => Number(row.allotted_minutes || 0) > 0 && Number(row.elapsed_minutes || 0) > Number(row.allotted_minutes || 0)).length;

    const insights: Array<{ severity: "high" | "medium" | "good"; title: string; detail: string }> = [];
    if (outOfStock > 0) insights.push({ severity: "high", title: `${outOfStock} products are out of stock`, detail: "Resolve through credible inbound, transfer-before-purchase, or replenishment buying based on forward demand." });
    if (overduePOs.length > 0) insights.push({ severity: "high", title: `${overduePOs.length} purchase orders are past expected delivery`, detail: "Overdue supply is not trusted as guaranteed inbound by the replenishment intelligence layer." });
    if (overdueRepairs > 0) insights.push({ severity: "high", title: `${overdueRepairs} active repairs are past pickup due`, detail: "Check parts, technician capacity and customer authorization blockers before promising new completion dates." });
    if (laborOverruns > 0) insights.push({ severity: "medium", title: `${laborOverruns} active technician tasks are over allotted time`, detail: "Supervisor review may reveal diagnostic complexity, skills mismatch or unrealistic standard labor allowances." });
    if (!insights.length && [state.inventory, state.purchaseOrders, state.workOrders, state.activeTasks].some((source) => source.available)) insights.push({ severity: "good", title: "No immediate operational exceptions detected", detail: "Continue monitoring stock, supplier delivery, repair deadlines and technician load as new POS events arrive." });
    return { outOfStock, lowStock, openPOs: openPOs.length, overduePOs: overduePOs.length, purchasingExposure, overdueRepairs, laborOverruns, insights };
  }, [state]);

  const coverage = [["Inventory", state.inventory], ["Purchasing", state.purchaseOrders], ["Repairs", state.workOrders], ["Technician load", state.activeTasks], ["Suppliers", state.suppliers]] as const;

  return <section className="sc-erp-intelligence" data-guide-id="erp-intelligence-board">
    <div className="sc-erp-intelligence__hero"><div><BrainCircuit size={22}/><div><span>ERP Intelligence Core</span><strong>Operational decisions from live evidence</strong><p>Inventory, purchasing, suppliers, repairs and technician capacity are analyzed without creating duplicate source-of-truth records.</p></div></div><button type="button" onClick={() => void load()} disabled={state.loading}><RefreshCw size={15}/>{state.loading ? "Refreshing…" : "Refresh intelligence"}</button></div>
    <div className="sc-erp-intelligence__metrics">
      <article className={intelligence.outOfStock ? "is-danger" : ""}><PackageSearch size={18}/><span>Out of stock</span><strong>{state.inventory.available ? intelligence.outOfStock : "—"}</strong><small>{state.inventory.available ? `${intelligence.lowStock} additional low-stock items` : "Inventory evidence unavailable"}</small></article>
      <article className={intelligence.overduePOs ? "is-warning" : ""}><Truck size={18}/><span>Open purchasing</span><strong>{state.purchaseOrders.available ? intelligence.openPOs : "—"}</strong><small>{state.purchaseOrders.available ? `${intelligence.overduePOs} overdue · ${money(intelligence.purchasingExposure)} exposure` : "Purchasing evidence unavailable"}</small></article>
      <article className={intelligence.overdueRepairs ? "is-warning" : ""}><Wrench size={18}/><span>Repair deadlines</span><strong>{state.workOrders.available ? intelligence.overdueRepairs : "—"}</strong><small>Active repairs past pickup due</small></article>
      <article className={intelligence.laborOverruns ? "is-warning" : ""}><Clock3 size={18}/><span>Labor overruns</span><strong>{state.activeTasks.available ? intelligence.laborOverruns : "—"}</strong><small>Running tasks above allotted time</small></article>
    </div>
    <div className="sc-erp-intelligence__grid">
      <section className="sc-erp-intelligence__panel"><div className="sc-erp-intelligence__title"><AlertTriangle size={18}/><div><strong>Management attention</strong><span>Evidence-backed exceptions and recommended review</span></div></div><div className="sc-erp-intelligence__insights">{intelligence.insights.length ? intelligence.insights.map((item, index) => <article key={`${item.title}-${index}`} className={`is-${item.severity}`}><i/><div><strong>{item.title}</strong><p>{item.detail}</p></div></article>) : <div className="sc-ops-empty"><strong>Insufficient evidence</strong><p>Your current permissions do not expose enough operational data to calculate management exceptions.</p></div>}</div></section>
      <section className="sc-erp-intelligence__panel"><div className="sc-erp-intelligence__title"><ShieldCheck size={18}/><div><strong>Evidence coverage</strong><span>Intelligence fails closed when source data is restricted or missing</span></div></div><div className="sc-erp-intelligence__coverage">{coverage.map(([name, dataset]) => <div key={name}><span>{name}</span><strong className={dataset.available ? "is-verified" : "is-unavailable"}>{dataset.available ? `${dataset.rows.length} records` : "Unavailable"}</strong><small>{dataset.available ? "Live POS evidence" : dataset.reason || "Not exposed"}</small></div>)}</div></section>
    </div>

    <ReplenishmentDecisionBoard />
    <ConsolidatedPurchasePlan />
    <SupplierPurchaseIntelligence />
    <SmartTransferRecommendations />
    <InventoryCapitalIntelligence />
  </section>;
}
