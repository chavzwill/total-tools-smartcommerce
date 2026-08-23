import { Banknote, Boxes, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { operationsRequest, type OperationsApiError } from "../../lib/staffOperations";
import "../../styles/inventory-capital-intelligence.css";

type Row = Record<string, any>;
type Branch = { id: string; name: string; isWarehouse: boolean };
type Snapshot = { branch: Branch; inventory: Row[]; recent: Map<string, number>; prior: Map<string, number> };

const WINDOW_DAYS = 30;
const STAGNANT_DAYS = 60;
const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const iso = (date: Date) => date.toISOString().slice(0, 10);
const money = (value: number) => new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", maximumFractionDigits: 0 }).format(value || 0);

async function branches(): Promise<Branch[]> {
  const [dashboard, inventory] = await Promise.all([
    operationsRequest<any>("reports/dashboard"),
    operationsRequest<any>("reports/inventory"),
  ]);
  const output: Branch[] = [];
  const seen = new Set<string>();
  for (const row of Array.isArray(dashboard?.byLocation) ? dashboard.byLocation : []) {
    const id = String(row.id || ""); if (!id || seen.has(id)) continue;
    seen.add(id); output.push({ id, name: String(row.name || `Branch ${id}`), isWarehouse: false });
  }
  for (const row of Array.isArray(inventory?.warehouseValue) ? inventory.warehouseValue : []) {
    const id = String(row.branch_id || ""); if (!id || seen.has(id)) continue;
    seen.add(id); output.push({ id, name: String(row.branch_name || `Warehouse ${id}`), isWarehouse: true });
  }
  return output;
}

function movementMap(rows: Row[]) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const sku = String(row.sku || "").trim(); if (!sku) continue;
    map.set(sku, Math.max(0, n(row.units_sold)));
  }
  return map;
}

async function snapshot(branch: Branch, recentStart: string, recentEnd: string, priorStart: string, priorEnd: string): Promise<Snapshot> {
  const inventory = await operationsRequest<Row[]>(`inventory?branch_id=${encodeURIComponent(branch.id)}&active=1&is_service=0&is_rental=0&is_non_inventory=0`);
  if (branch.isWarehouse) return { branch, inventory: Array.isArray(inventory) ? inventory : [], recent: new Map(), prior: new Map() };
  const [recentRows, priorRows] = await Promise.all([
    operationsRequest<Row[]>(`reports/top-products?start=${recentStart}&end=${recentEnd}&branch_id=${encodeURIComponent(branch.id)}&limit=5000`),
    operationsRequest<Row[]>(`reports/top-products?start=${priorStart}&end=${priorEnd}&branch_id=${encodeURIComponent(branch.id)}&limit=5000`),
  ]);
  return { branch, inventory: Array.isArray(inventory) ? inventory : [], recent: movementMap(recentRows), prior: movementMap(priorRows) };
}

export default function InventoryCapitalIntelligence() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);

  async function load() {
    setLoading(true); setError("");
    try {
      const locations = await branches();
      const recentEnd = new Date();
      const recentStart = new Date(recentEnd.getTime() - (WINDOW_DAYS - 1) * 86400000);
      const priorEnd = new Date(recentStart.getTime() - 86400000);
      const priorStart = new Date(priorEnd.getTime() - (WINDOW_DAYS - 1) * 86400000);
      setSnapshots(await Promise.all(locations.slice(0, 20).map((branch) => snapshot(branch, iso(recentStart), iso(recentEnd), iso(priorStart), iso(priorEnd)))));
    } catch (cause) {
      const apiError = cause as OperationsApiError;
      setError(apiError.status === 403 ? "Inventory and Reports permissions are required for capital intelligence." : apiError.message || "Inventory capital intelligence could not be loaded.");
      setSnapshots([]);
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const analysis = useMemo(() => {
    const rows: Array<{ sku: string; name: string; branch: string; stock: number; cost: number; value: number; recent: number; prior: number; trend: number | null; className: string }> = [];
    let totalValue = 0, stagnantValue = 0, decliningValue = 0;
    for (const snap of snapshots) {
      for (const item of snap.inventory) {
        const sku = String(item.sku || "").trim(); if (!sku) continue;
        const stock = Math.max(0, n(item.stock_qty)); const cost = Math.max(0, n(item.cost)); const value = stock * cost;
        if (!stock || !value) continue;
        totalValue += value;
        const recent = snap.branch.isWarehouse ? 0 : (snap.recent.get(sku) || 0);
        const prior = snap.branch.isWarehouse ? 0 : (snap.prior.get(sku) || 0);
        const trend = prior > 0 ? ((recent - prior) / prior) * 100 : recent > 0 ? 100 : null;
        const stagnant = !snap.branch.isWarehouse && recent === 0 && prior === 0;
        const declining = !snap.branch.isWarehouse && prior >= 2 && recent < prior * 0.5;
        if (stagnant) stagnantValue += value;
        if (declining) decliningValue += value;
        if (stagnant || declining || snap.branch.isWarehouse) rows.push({ sku, name: String(item.name || sku), branch: snap.branch.name, stock, cost, value, recent, prior, trend, className: stagnant ? "stagnant" : declining ? "declining" : "warehouse" });
      }
    }
    rows.sort((a, b) => b.value - a.value);
    return { rows, totalValue, stagnantValue, decliningValue };
  }, [snapshots]);

  return <section className="sc-capital-intelligence" data-guide-id="inventory-capital-intelligence">
    <div className="sc-capital-intelligence__heading"><div><Banknote size={19}/><div><span>Inventory Capital Intelligence</span><strong>Find cash trapped in the wrong location</strong><p>Uses branch stock, product cost and two consecutive 30-day movement windows to identify stagnant and sharply declining inventory without pretending to know FIFO stock age.</p></div></div><button type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/>{loading ? "Analyzing…" : "Recalculate"}</button></div>
    <div className="sc-capital-intelligence__metrics">
      <article><Boxes size={17}/><span>Inventory cost exposure</span><strong>{loading ? "—" : money(analysis.totalValue)}</strong><small>Analyzed branch/warehouse stock</small></article>
      <article className={analysis.stagnantValue ? "is-warning" : ""}><TrendingDown size={17}/><span>Stagnant store capital</span><strong>{loading ? "—" : money(analysis.stagnantValue)}</strong><small>No sales in either 30-day window</small></article>
      <article className={analysis.decliningValue ? "is-warning" : ""}><TrendingUp size={17}/><span>Demand deterioration</span><strong>{loading ? "—" : money(analysis.decliningValue)}</strong><small>Recent movement fell by more than 50%</small></article>
    </div>
    {error ? <div className="sc-ops-empty is-error"><strong>Capital intelligence unavailable</strong><p>{error}</p></div> : null}
    {!error && !loading && !analysis.rows.length ? <div className="sc-ops-empty"><strong>No material stagnant inventory detected</strong><p>Current evidence does not show stock with significant cost value and weak movement under the configured rules.</p></div> : null}
    {analysis.rows.length ? <div className="sc-capital-intelligence__list">{analysis.rows.slice(0, 100).map((row) => <article key={`${row.branch}-${row.sku}`} className={`is-${row.className}`}><div><strong>{row.name}</strong><span>{row.sku} · {row.branch}</span></div><div><small>On hand</small><strong>{row.stock}</strong></div><div><small>Cost value</small><strong>{money(row.value)}</strong></div><div><small>Prior 30d</small><strong>{row.prior}</strong></div><div><small>Recent 30d</small><strong>{row.recent}</strong></div><div><small>Demand signal</small><strong>{row.className === "warehouse" ? "Supply stock" : row.trend == null ? "No movement" : `${row.trend > 0 ? "+" : ""}${Math.round(row.trend)}%`}</strong></div></article>)}</div> : null}
    <p className="sc-capital-intelligence__footnote">“Stagnant” means no recorded store sales across the two analyzed 30-day windows. It is not presented as physical stock age. True receipt/FIFO aging requires a dedicated complete receipt-lot history export.</p>
  </section>;
}
