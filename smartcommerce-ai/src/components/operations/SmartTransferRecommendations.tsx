import { ArrowRightLeft, Boxes, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { operationsRequest, type OperationsApiError } from "../../lib/staffOperations";
import "../../styles/smart-transfer-recommendations.css";

type Row = Record<string, any>;
type Branch = { id: string; name: string; isWarehouse: boolean };
type BranchSnapshot = { branch: Branch; inventory: Row[]; movement: Map<string, number> };
type Recommendation = {
  sku: string;
  productName: string;
  fromBranch: string;
  toBranch: string;
  quantity: number;
  sourceStock: number;
  sourceDaily: number;
  sourceDaysCover: number | null;
  destinationStock: number;
  destinationMinimum: number;
  destinationDaily: number;
  destinationDaysCover: number | null;
  projectedSourceStock: number;
  projectedDestinationStock: number;
  urgency: "critical" | "high" | "medium";
  confidence: "high" | "medium";
  reason: string;
};

const LOOKBACK_DAYS = 60;
const DESTINATION_TARGET_DAYS = 45;
const SOURCE_SAFETY_DAYS = 45;
const LOW_COVER_DAYS = 21;

function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
function n(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function daysCover(stock: number, daily: number) { return daily > 0 ? stock / daily : null; }

async function loadBranches(): Promise<Branch[]> {
  const [dashboard, inventoryReport] = await Promise.all([
    operationsRequest<any>("reports/dashboard"),
    operationsRequest<any>("reports/inventory"),
  ]);
  const seen = new Set<string>();
  const branches: Branch[] = [];
  for (const row of Array.isArray(dashboard?.byLocation) ? dashboard.byLocation : []) {
    const id = String(row.id ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    branches.push({ id, name: String(row.name || `Branch ${id}`), isWarehouse: false });
  }
  for (const row of Array.isArray(inventoryReport?.warehouseValue) ? inventoryReport.warehouseValue : []) {
    const id = String(row.branch_id ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    branches.push({ id, name: String(row.branch_name || `Warehouse ${id}`), isWarehouse: true });
  }
  return branches;
}

async function loadBranchSnapshot(branch: Branch, start: string, end: string): Promise<BranchSnapshot> {
  const inventoryPromise = operationsRequest<Row[]>(`inventory?branch_id=${encodeURIComponent(branch.id)}&active=1&is_service=0&is_rental=0&is_non_inventory=0`);
  const salesPromise = branch.isWarehouse
    ? Promise.resolve([] as Row[])
    : operationsRequest<Row[]>(`reports/top-products?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&branch_id=${encodeURIComponent(branch.id)}&limit=5000`);
  const [inventory, sales] = await Promise.all([inventoryPromise, salesPromise]);
  const movement = new Map<string, number>();
  for (const row of Array.isArray(sales) ? sales : []) {
    const sku = String(row.sku || "").trim();
    if (sku) movement.set(sku, Math.max(0, n(row.units_sold)));
  }
  return { branch, inventory: Array.isArray(inventory) ? inventory : [], movement };
}

function buildRecommendations(snapshots: BranchSnapshot[]): Recommendation[] {
  const bySku = new Map<string, Array<{ snapshot: BranchSnapshot; row: Row }>>();
  for (const snapshot of snapshots) {
    for (const row of snapshot.inventory) {
      const sku = String(row.sku || "").trim();
      if (!sku) continue;
      const list = bySku.get(sku) || [];
      list.push({ snapshot, row });
      bySku.set(sku, list);
    }
  }

  const recommendations: Recommendation[] = [];
  for (const [sku, positions] of bySku.entries()) {
    for (const destination of positions) {
      if (destination.snapshot.branch.isWarehouse) continue;
      const destinationStock = Math.max(0, n(destination.row.stock_qty));
      const destinationMinimum = Math.max(0, n(destination.row.min_stock));
      const destinationUnits = destination.snapshot.movement.get(sku) || 0;
      const destinationDaily = destinationUnits / LOOKBACK_DAYS;
      const destinationCover = daysCover(destinationStock, destinationDaily);
      const atRisk = destinationStock <= destinationMinimum || (destinationDaily > 0 && (destinationCover ?? Infinity) < LOW_COVER_DAYS);
      if (!atRisk) continue;

      const targetStock = Math.max(
        destinationMinimum * 2,
        destinationDaily > 0 ? Math.ceil(destinationDaily * DESTINATION_TARGET_DAYS) : destinationMinimum * 2,
        destinationMinimum + 1,
      );
      const destinationNeed = Math.max(1, Math.ceil(targetStock - destinationStock));

      const candidates = positions
        .filter((candidate) => candidate.snapshot.branch.id !== destination.snapshot.branch.id)
        .map((candidate) => {
          const sourceStock = Math.max(0, n(candidate.row.stock_qty));
          const sourceMinimum = Math.max(0, n(candidate.row.min_stock));
          const sourceUnits = candidate.snapshot.branch.isWarehouse ? 0 : (candidate.snapshot.movement.get(sku) || 0);
          const sourceDaily = sourceUnits / LOOKBACK_DAYS;
          const safetyStock = Math.max(sourceMinimum * 1.5, sourceDaily > 0 ? Math.ceil(sourceDaily * SOURCE_SAFETY_DAYS) : sourceMinimum * 1.5, 1);
          const transferable = Math.max(0, Math.floor(sourceStock - safetyStock));
          const sourceCover = daysCover(sourceStock, sourceDaily);
          const slowRelativeToDestination = candidate.snapshot.branch.isWarehouse || destinationDaily === 0 || sourceDaily <= destinationDaily * 0.5 || (sourceCover != null && sourceCover >= 90);
          return { candidate, sourceStock, sourceDaily, sourceCover, transferable, slowRelativeToDestination };
        })
        .filter((entry) => entry.transferable > 0 && entry.slowRelativeToDestination)
        .sort((a, b) => {
          if (a.candidate.snapshot.branch.isWarehouse !== b.candidate.snapshot.branch.isWarehouse) return a.candidate.snapshot.branch.isWarehouse ? -1 : 1;
          const aCover = a.sourceCover ?? 9999;
          const bCover = b.sourceCover ?? 9999;
          return b.transferable - a.transferable || bCover - aCover || a.sourceDaily - b.sourceDaily;
        });

      const source = candidates[0];
      if (!source) continue;
      const quantity = Math.min(destinationNeed, source.transferable);
      if (quantity <= 0) continue;

      const urgency: Recommendation["urgency"] = destinationStock <= 0 ? "critical" : destinationStock <= destinationMinimum ? "high" : "medium";
      const confidence: Recommendation["confidence"] = destinationUnits >= 3 || source.candidate.snapshot.branch.isWarehouse ? "high" : "medium";
      const sourceLabel = source.candidate.snapshot.branch.isWarehouse
        ? "warehouse stock"
        : source.sourceDaily === 0
          ? `no recorded sales in ${LOOKBACK_DAYS} days`
          : `${source.sourceDaily.toFixed(2)} units/day vs ${destinationDaily.toFixed(2)} at destination`;

      recommendations.push({
        sku,
        productName: String(destination.row.name || source.candidate.row.name || sku),
        fromBranch: source.candidate.snapshot.branch.name,
        toBranch: destination.snapshot.branch.name,
        quantity,
        sourceStock: source.sourceStock,
        sourceDaily: source.sourceDaily,
        sourceDaysCover: source.sourceCover,
        destinationStock,
        destinationMinimum,
        destinationDaily,
        destinationDaysCover: destinationCover,
        projectedSourceStock: source.sourceStock - quantity,
        projectedDestinationStock: destinationStock + quantity,
        urgency,
        confidence,
        reason: `${destination.snapshot.branch.name} is ${destinationStock <= destinationMinimum ? "at/below its minimum" : "running below 21 days of cover"}; ${source.candidate.snapshot.branch.name} has ${sourceLabel} and can release stock without falling below its safety level.`,
      });
    }
  }

  return recommendations.sort((a, b) => {
    const rank = { critical: 3, high: 2, medium: 1 };
    return rank[b.urgency] - rank[a.urgency] || b.destinationDaily - a.destinationDaily || b.quantity - a.quantity;
  });
}

export default function SmartTransferRecommendations() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [snapshots, setSnapshots] = useState<BranchSnapshot[]>([]);

  async function load() {
    setLoading(true); setError("");
    try {
      const branches = await loadBranches();
      if (branches.length < 2) throw new Error("At least two branch/warehouse locations are required for transfer intelligence.");
      const end = new Date();
      const start = new Date(end.getTime() - (LOOKBACK_DAYS - 1) * 86400000);
      const results = await Promise.all(branches.slice(0, 20).map((branch) => loadBranchSnapshot(branch, isoDate(start), isoDate(end))));
      setSnapshots(results);
    } catch (cause) {
      const apiError = cause as OperationsApiError;
      setError(apiError.status === 403 ? "Inventory and Reports permissions are both required for smart transfer recommendations." : apiError.message || "Smart transfer intelligence could not be loaded.");
      setSnapshots([]);
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);
  const recommendations = useMemo(() => buildRecommendations(snapshots), [snapshots]);
  const branchCount = snapshots.filter((item) => !item.branch.isWarehouse).length;
  const warehouseCount = snapshots.filter((item) => item.branch.isWarehouse).length;

  return <section className="sc-smart-transfer" data-guide-id="smart-transfer-recommendations">
    <div className="sc-smart-transfer__heading">
      <div><ArrowRightLeft size={19}/><div><span>Smart Transfer Intelligence</span><strong>Move slow stock before buying more</strong><p>Compares stock and 60-day movement across locations, protects source safety stock, and prioritizes branches approaching stockout.</p></div></div>
      <button type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/>{loading ? "Analyzing…" : "Recalculate"}</button>
    </div>

    <div className="sc-smart-transfer__metrics">
      <article><Boxes size={17}/><span>Locations analyzed</span><strong>{snapshots.length || "—"}</strong><small>{branchCount} stores · {warehouseCount} warehouses</small></article>
      <article><TrendingUp size={17}/><span>Transfer opportunities</span><strong>{loading ? "—" : recommendations.length}</strong><small>Evidence-backed candidates</small></article>
      <article><TrendingDown size={17}/><span>Critical stockouts</span><strong>{loading ? "—" : recommendations.filter((item) => item.urgency === "critical").length}</strong><small>Destinations already at zero</small></article>
    </div>

    {error ? <div className="sc-ops-empty is-error"><strong>Smart transfer intelligence unavailable</strong><p>{error}</p></div> : null}
    {!error && !loading && !recommendations.length ? <div className="sc-ops-empty"><strong>No safe transfer opportunities found</strong><p>No location currently has both a destination stock risk and another location with defensible surplus stock.</p></div> : null}

    {recommendations.length ? <div className="sc-smart-transfer__list">
      {recommendations.slice(0, 100).map((item) => <article key={`${item.sku}-${item.fromBranch}-${item.toBranch}`} className={`is-${item.urgency}`}>
        <div className="sc-smart-transfer__product"><em>{item.urgency}</em><div><strong>{item.productName}</strong><span>{item.sku}</span></div></div>
        <div className="sc-smart-transfer__route"><div><small>Move from</small><strong>{item.fromBranch}</strong><span>{item.sourceStock} on hand · {item.sourceDaily.toFixed(2)}/day</span></div><ArrowRightLeft size={17}/><div><small>Move to</small><strong>{item.toBranch}</strong><span>{item.destinationStock} on hand · {item.destinationDaily.toFixed(2)}/day</span></div></div>
        <div className="sc-smart-transfer__quantity"><small>Recommended qty</small><strong>{item.quantity}</strong><span>Projected: {item.projectedSourceStock} source · {item.projectedDestinationStock} destination</span></div>
        <p>{item.reason}</p>
        <div className="sc-smart-transfer__meta"><span>Destination minimum {item.destinationMinimum}</span><span>{item.destinationDaysCover == null ? "No destination sales history" : `${item.destinationDaysCover.toFixed(1)} days cover`}</span><span>{item.sourceDaysCover == null ? "Source has no store-sales velocity" : `${item.sourceDaysCover.toFixed(1)} source days cover`}</span><em className={`is-${item.confidence}`}>{item.confidence} confidence</em></div>
      </article>)}
    </div> : null}
    <p className="sc-smart-transfer__footnote">Recommendations are advisory only. They do not create a transfer automatically; staff still use the POS transfer workflow, which performs the actual stock deduction, dispatch and receipt controls.</p>
  </section>;
}
