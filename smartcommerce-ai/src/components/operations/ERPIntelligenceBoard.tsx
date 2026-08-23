import { AlertTriangle, BrainCircuit, Clock3, PackageSearch, RefreshCw, ShieldCheck, Truck, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { operationsRequest, type OperationsApiError } from "../../lib/staffOperations";
import InventoryCapitalIntelligence from "./InventoryCapitalIntelligence";
import SmartTransferRecommendations from "./SmartTransferRecommendations";
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
const initialState: IntelligenceState = {
  loading: true,
  inventory: unavailable(),
  purchaseOrders: unavailable(),
  workOrders: unavailable(),
  activeTasks: unavailable(),
  suppliers: unavailable(),
};

function asRows(value: unknown): Row[] {
  if (Array.isArray(value)) return value as Row[];
  if (!value || typeof value !== "object") return [];
  const row = value as Record<string, unknown>;
  for (const key of ["rows", "items", "data", "products", "work_orders"]) if (Array.isArray(row[key])) return row[key] as Row[];
  return [];
}

function daysBetween(start: unknown, end: unknown) {
  const a = new Date(String(start || ""));
  const b = new Date(String(end || ""));
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return null;
  return Math.max(0, (b.getTime() - a.getTime()) / 86400000);
}

function money(value: number) {
  return new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", maximumFractionDigits: 0 }).format(value || 0);
}

async function loadDataset(path: string): Promise<Dataset> {
  try {
    const payload = await operationsRequest<unknown>(path);
    return { rows: asRows(payload), available: true };
  } catch (error) {
    const apiError = error as OperationsApiError;
    return { rows: [], available: false, reason: apiError.status === 403 ? "Restricted by staff permissions" : apiError.message || "Unavailable" };
  }
}

export default function ERPIntelligenceBoard() {
  const [state, setState] = useState<IntelligenceState>(initialState);

  async function load() {
    setState((current) => ({ ...current, loading: true }));
    const [inventory, purchaseOrders, workOrders, activeTasks, suppliers] = await Promise.all([
      loadDataset("inventory?limit=500"),
      loadDataset("purchase-orders?limit=250"),
      loadDataset("work-orders?view=active"),
      loadDataset("work-orders/active-tasks"),
      loadDataset("suppliers?active=true"),
    ]);
    setState({ loading: false, inventory, purchaseOrders, workOrders, activeTasks, suppliers });
  }

  useEffect(() => { void load(); }, []);

  const intelligence = useMemo(() => {
    const inventory = state.inventory.rows;
    const purchaseOrders = state.purchaseOrders.rows;
    const workOrders = state.workOrders.rows;
    const activeTasks = state.activeTasks.rows;
    const now = Date.now();

    const outOfStock = inventory.filter((row) => Number(row.stock_qty ?? row.stock ?? 0) <= 0).length;
    const lowStock = inventory.filter((row) => {
      const stock = Number(row.stock_qty ?? row.stock ?? 0);
      const minimum = Number(row.min_stock ?? row.reorder_level ?? 0);
      return stock > 0 && minimum > 0 && stock <= minimum;
    }).length;

    const openPOs = purchaseOrders.filter((row) => !["received", "cancelled", "closed"].includes(String(row.status || "")));
    const overduePOs = openPOs.filter((row) => {
      const expected = new Date(String(row.expected_date || ""));
      return Number.isFinite(expected.getTime()) && expected.getTime() < now;
    });
    const purchasingExposure = openPOs.reduce((sum, row) => sum + Math.max(0, Number(row.total || 0)), 0);

    const overdueRepairs = workOrders.filter((row) => Number(row.days_past_pickup_due || 0) > 0).length;
    const laborOverruns = activeTasks.filter((row) => {
      const elapsed = Number(row.elapsed_minutes || 0);
      const allotted = Number(row.allotted_minutes || 0);
      return allotted > 0 && elapsed > allotted;
    }).length;

    const supplierMap = new Map<string, { name: string; orders: number; received: number; onTime: number; dated: number; spend: number; leadDays: number[] }>();
    purchaseOrders.forEach((po) => {
      const id = String(po.supplier_id ?? po.supplier_name ?? "unknown");
      if (id === "unknown") return;
      const current = supplierMap.get(id) || { name: String(po.supplier_name || `Supplier ${id}`), orders: 0, received: 0, onTime: 0, dated: 0, spend: 0, leadDays: [] };
      current.orders += 1;
      current.spend += Math.max(0, Number(po.total || 0));
      if (po.received_at) {
        current.received += 1;
        const lead = daysBetween(po.created_at, po.received_at);
        if (lead != null) current.leadDays.push(lead);
        if (po.expected_date) {
          current.dated += 1;
          const received = new Date(String(po.received_at));
          const expected = new Date(String(po.expected_date));
          if (Number.isFinite(received.getTime()) && Number.isFinite(expected.getTime()) && received.getTime() <= expected.getTime() + 86400000) current.onTime += 1;
        }
      }
      supplierMap.set(id, current);
    });

    const suppliers = [...supplierMap.values()].map((supplier) => {
      const reliability = supplier.dated ? (supplier.onTime / supplier.dated) * 100 : null;
      const averageLead = supplier.leadDays.length ? supplier.leadDays.reduce((a, b) => a + b, 0) / supplier.leadDays.length : null;
      const sampleReady = supplier.received >= 3 && supplier.dated >= 2;
      return { ...supplier, reliability, averageLead, sampleReady };
    }).sort((a, b) => {
      if (a.sampleReady !== b.sampleReady) return a.sampleReady ? -1 : 1;
      return (b.reliability ?? -1) - (a.reliability ?? -1) || b.orders - a.orders;
    });

    const insights: Array<{ severity: "high" | "medium" | "good"; title: string; detail: string }> = [];
    if (outOfStock > 0) insights.push({ severity: "high", title: `${outOfStock} products are out of stock`, detail: "Prioritize transfer-before-purchase checks, then replenish items tied to active demand and repair requirements." });
    if (overduePOs.length > 0) insights.push({ severity: "high", title: `${overduePOs.length} purchase orders are past expected delivery`, detail: "Review supplier follow-up and customer/repair promises that depend on these receipts." });
    if (overdueRepairs > 0) insights.push({ severity: "high", title: `${overdueRepairs} active repairs are past pickup due`, detail: "Check parts, technician capacity and customer authorization blockers before promising new completion dates." });
    if (laborOverruns > 0) insights.push({ severity: "medium", title: `${laborOverruns} active technician tasks are over allotted time`, detail: "Supervisor review may reveal diagnostic complexity, skills mismatch or unrealistic standard labor allowances." });
    if (!insights.length && [state.inventory, state.purchaseOrders, state.workOrders, state.activeTasks].some((source) => source.available)) insights.push({ severity: "good", title: "No immediate operational exceptions detected", detail: "Continue monitoring stock, supplier delivery, repair deadlines and technician load as new POS events arrive." });

    return { outOfStock, lowStock, openPOs: openPOs.length, overduePOs: overduePOs.length, purchasingExposure, overdueRepairs, laborOverruns, suppliers, insights };
  }, [state]);

  const coverage = [
    ["Inventory", state.inventory],
    ["Purchasing", state.purchaseOrders],
    ["Repairs", state.workOrders],
    ["Technician load", state.activeTasks],
    ["Suppliers", state.suppliers],
  ] as const;

  return <section className="sc-erp-intelligence" data-guide-id="erp-intelligence-board">
    <div className="sc-erp-intelligence__hero">
      <div><BrainCircuit size={22}/><div><span>ERP Intelligence Core</span><strong>Operational decisions from live evidence</strong><p>Inventory, purchasing, suppliers, repairs and technician capacity are analyzed without creating duplicate source-of-truth records.</p></div></div>
      <button type="button" onClick={() => void load()} disabled={state.loading}><RefreshCw size={15}/>{state.loading ? "Refreshing…" : "Refresh intelligence"}</button>
    </div>

    <div className="sc-erp-intelligence__metrics">
      <article className={intelligence.outOfStock ? "is-danger" : ""}><PackageSearch size={18}/><span>Out of stock</span><strong>{state.inventory.available ? intelligence.outOfStock : "—"}</strong><small>{state.inventory.available ? `${intelligence.lowStock} additional low-stock items` : "Inventory evidence unavailable"}</small></article>
      <article className={intelligence.overduePOs ? "is-warning" : ""}><Truck size={18}/><span>Open purchasing</span><strong>{state.purchaseOrders.available ? intelligence.openPOs : "—"}</strong><small>{state.purchaseOrders.available ? `${intelligence.overduePOs} overdue · ${money(intelligence.purchasingExposure)} exposure` : "Purchasing evidence unavailable"}</small></article>
      <article className={intelligence.overdueRepairs ? "is-warning" : ""}><Wrench size={18}/><span>Repair deadlines</span><strong>{state.workOrders.available ? intelligence.overdueRepairs : "—"}</strong><small>Active repairs past pickup due</small></article>
      <article className={intelligence.laborOverruns ? "is-warning" : ""}><Clock3 size={18}/><span>Labor overruns</span><strong>{state.activeTasks.available ? intelligence.laborOverruns : "—"}</strong><small>Running tasks above allotted time</small></article>
    </div>

    <div className="sc-erp-intelligence__grid">
      <section className="sc-erp-intelligence__panel">
        <div className="sc-erp-intelligence__title"><AlertTriangle size={18}/><div><strong>Management attention</strong><span>Evidence-backed exceptions and recommended review</span></div></div>
        <div className="sc-erp-intelligence__insights">{intelligence.insights.length ? intelligence.insights.map((item, index) => <article key={`${item.title}-${index}`} className={`is-${item.severity}`}><i/><div><strong>{item.title}</strong><p>{item.detail}</p></div></article>) : <div className="sc-ops-empty"><strong>Insufficient evidence</strong><p>Your current permissions do not expose enough operational data to calculate management exceptions.</p></div>}</div>
      </section>

      <section className="sc-erp-intelligence__panel">
        <div className="sc-erp-intelligence__title"><ShieldCheck size={18}/><div><strong>Evidence coverage</strong><span>Intelligence fails closed when source data is restricted or missing</span></div></div>
        <div className="sc-erp-intelligence__coverage">{coverage.map(([name, dataset]) => <div key={name}><span>{name}</span><strong className={dataset.available ? "is-verified" : "is-unavailable"}>{dataset.available ? `${dataset.rows.length} records` : "Unavailable"}</strong><small>{dataset.available ? "Live POS evidence" : dataset.reason || "Not exposed"}</small></div>)}</div>
      </section>
    </div>

    <SmartTransferRecommendations />
    <InventoryCapitalIntelligence />

    <section className="sc-erp-intelligence__panel">
      <div className="sc-erp-intelligence__title"><Truck size={18}/><div><strong>Supplier intelligence</strong><span>Lead-time reliability, cycle time and spend derived from purchase-order history</span></div></div>
      {!state.purchaseOrders.available ? <div className="sc-ops-empty"><strong>Supplier performance unavailable</strong><p>Purchase-order evidence is required before supplier performance can be ranked.</p></div> : !intelligence.suppliers.length ? <div className="sc-ops-empty"><strong>No supplier history yet</strong><p>Supplier scores will appear after purchase orders establish a measurable history.</p></div> : <div className="sc-erp-intelligence__suppliers">
        <div className="sc-erp-intelligence__supplier-head"><span>Supplier</span><span>Orders</span><span>On-time</span><span>Avg lead</span><span>Spend</span><span>Confidence</span></div>
        {intelligence.suppliers.slice(0, 25).map((supplier) => <article key={supplier.name}><div><strong>{supplier.name}</strong><small>{supplier.received} received orders</small></div><span>{supplier.orders}</span><strong>{supplier.reliability == null ? "—" : `${Math.round(supplier.reliability)}%`}</strong><span>{supplier.averageLead == null ? "—" : `${supplier.averageLead.toFixed(1)}d`}</span><span>{money(supplier.spend)}</span><em className={supplier.sampleReady ? "is-ready" : "is-learning"}>{supplier.sampleReady ? "Usable" : "Learning"}</em></article>)}
      </div>}
      <p className="sc-erp-intelligence__footnote">Fill-rate and item-level price-performance scoring remain excluded until sufficient line-level receiving history is exposed; the system does not infer them from incomplete data.</p>
    </section>
  </section>;
}
