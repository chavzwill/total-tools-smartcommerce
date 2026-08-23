import { ArrowRightLeft, Boxes, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { operationsRequest, type OperationsApiError } from "../../lib/staffOperations";
import "../../styles/smart-transfer-recommendations.css";

type Row = Record<string, any>;
type Branch = { id: string; name: string; isWarehouse: boolean };
type BranchSnapshot = { branch: Branch; inventory: Row[]; movement: Map<string, number> };
type EvidenceMap = Map<string, number>;
type CommitmentState = {
  incomingTransfers: EvidenceMap;
  incomingPurchaseOrders: EvidenceMap;
  repairDemand: EvidenceMap;
  quoteDemand: EvidenceMap;
  coverage: Record<"transfers" | "purchaseOrders" | "repairs" | "quotes", boolean>;
};
type Recommendation = {
  sku: string;
  productName: string;
  fromBranch: string;
  toBranch: string;
  quantity: number;
  sourceStock: number;
  sourceCommitted: number;
  sourceEffective: number;
  sourceDaily: number;
  sourceDaysCover: number | null;
  destinationStock: number;
  destinationIncoming: number;
  destinationCommitted: number;
  destinationEffective: number;
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
const DETAIL_LIMIT = 80;

function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
function n(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function daysCover(stock: number, daily: number) { return daily > 0 ? Math.max(0, stock) / daily : null; }
function evidenceKey(branchId: unknown, sku: unknown) { return `${String(branchId ?? "")}::${String(sku ?? "").trim()}`; }
function add(map: EvidenceMap, branchId: unknown, sku: unknown, quantity: unknown) {
  const key = evidenceKey(branchId, sku);
  if (!String(branchId ?? "") || !String(sku ?? "").trim()) return;
  map.set(key, (map.get(key) || 0) + Math.max(0, n(quantity)));
}
function get(map: EvidenceMap, branchId: unknown, sku: unknown) { return map.get(evidenceKey(branchId, sku)) || 0; }

async function settledDetails(rows: Row[], pathFor: (row: Row) => string) {
  const results = await Promise.allSettled(rows.slice(0, DETAIL_LIMIT).map((row) => operationsRequest<Row>(pathFor(row))));
  return results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
}

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

async function loadCommitments(): Promise<CommitmentState> {
  const state: CommitmentState = {
    incomingTransfers: new Map(),
    incomingPurchaseOrders: new Map(),
    repairDemand: new Map(),
    quoteDemand: new Map(),
    coverage: { transfers: false, purchaseOrders: false, repairs: false, quotes: false },
  };
  const [transferResult, poResult, woResult, quoteResult] = await Promise.allSettled([
    operationsRequest<Row[]>("transfers?limit=250"),
    operationsRequest<Row[]>("purchase-orders?limit=250"),
    operationsRequest<Row[]>("work-orders?view=active&limit=150"),
    operationsRequest<Row[]>("quotations?status=accepted&limit=150"),
  ]);

  if (transferResult.status === "fulfilled") {
    state.coverage.transfers = true;
    const open = transferResult.value.filter((row) => ["pending", "in_transit"].includes(String(row.status || "")));
    for (const transfer of await settledDetails(open, (row) => `transfers/${encodeURIComponent(String(row.id))}`)) {
      for (const item of Array.isArray(transfer.items) ? transfer.items : []) {
        add(state.incomingTransfers, transfer.to_branch_id, item.sku, n(item.quantity_requested) - n(item.quantity_received));
      }
    }
  }

  if (poResult.status === "fulfilled") {
    state.coverage.purchaseOrders = true;
    const now = Date.now();
    const open = poResult.value.filter((row) => !["received", "cancelled", "closed"].includes(String(row.status || "")));
    for (const po of await settledDetails(open, (row) => `purchase-orders/${encodeURIComponent(String(row.id))}`)) {
      const expected = po.expected_date ? new Date(String(po.expected_date)).getTime() : NaN;
      const credibleInbound = Number.isFinite(expected) && expected >= now - 86400000;
      if (!credibleInbound) continue;
      for (const item of Array.isArray(po.items) ? po.items : []) {
        add(state.incomingPurchaseOrders, po.branch_id, item.sku, n(item.quantity_ordered) - n(item.quantity_received));
      }
    }
  }

  if (woResult.status === "fulfilled") {
    state.coverage.repairs = true;
    for (const wo of await settledDetails(woResult.value, (row) => `work-orders/${encodeURIComponent(String(row.id))}`)) {
      for (const item of Array.isArray(wo.items) ? wo.items : []) {
        if (item.is_customer_supplied) continue;
        const sourcedElsewhere = (Array.isArray(item.sources) ? item.sources : []).reduce((sum: number, source: Row) => sum + Math.max(0, n(source.quantity)), 0);
        const localNeed = Math.max(0, n(item.quantity) - sourcedElsewhere);
        add(state.repairDemand, wo.branch_id, item.sku, localNeed);
      }
    }
  }

  if (quoteResult.status === "fulfilled") {
    state.coverage.quotes = true;
    for (const quote of await settledDetails(quoteResult.value, (row) => `quotations/${encodeURIComponent(String(row.id))}`)) {
      for (const item of Array.isArray(quote.items) ? quote.items : []) {
        if (!item.sku) continue;
        const externallySourced = (Array.isArray(item.sources) ? item.sources : []).reduce((sum: number, source: Row) => sum + Math.max(0, n(source.quantity)), 0);
        const localCommitment = Math.max(0, n(item.quantity) - externallySourced);
        add(state.quoteDemand, quote.branch_id, item.sku, localCommitment);
      }
    }
  }

  return state;
}

function buildRecommendations(snapshots: BranchSnapshot[], commitments: CommitmentState): Recommendation[] {
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
  const coverageCount = Object.values(commitments.coverage).filter(Boolean).length;
  for (const [sku, positions] of bySku.entries()) {
    for (const destination of positions) {
      if (destination.snapshot.branch.isWarehouse) continue;
      const branchId = destination.snapshot.branch.id;
      const destinationStock = Math.max(0, n(destination.row.stock_qty));
      const destinationMinimum = Math.max(0, n(destination.row.min_stock));
      const incomingTransfers = get(commitments.incomingTransfers, branchId, sku);
      const incomingPOs = get(commitments.incomingPurchaseOrders, branchId, sku);
      const repairDemand = get(commitments.repairDemand, branchId, sku);
      const quoteDemand = get(commitments.quoteDemand, branchId, sku);
      const destinationIncoming = incomingTransfers + incomingPOs;
      const destinationCommitted = repairDemand + quoteDemand;
      const destinationEffective = Math.max(0, destinationStock + destinationIncoming - destinationCommitted);
      const destinationUnits = destination.snapshot.movement.get(sku) || 0;
      const destinationDaily = destinationUnits / LOOKBACK_DAYS;
      const destinationCover = daysCover(destinationEffective, destinationDaily);
      const atRisk = destinationEffective <= destinationMinimum || (destinationDaily > 0 && (destinationCover ?? Infinity) < LOW_COVER_DAYS);
      if (!atRisk) continue;

      const targetStock = Math.max(
        destinationMinimum * 2,
        destinationDaily > 0 ? Math.ceil(destinationDaily * DESTINATION_TARGET_DAYS) : destinationMinimum * 2,
        destinationMinimum + 1,
      );
      const destinationNeed = Math.max(1, Math.ceil(targetStock - destinationEffective));

      const candidates = positions
        .filter((candidate) => candidate.snapshot.branch.id !== branchId)
        .map((candidate) => {
          const sourceBranchId = candidate.snapshot.branch.id;
          const sourceStock = Math.max(0, n(candidate.row.stock_qty));
          const sourceCommitted = get(commitments.repairDemand, sourceBranchId, sku) + get(commitments.quoteDemand, sourceBranchId, sku);
          const sourceEffective = Math.max(0, sourceStock - sourceCommitted);
          const sourceMinimum = Math.max(0, n(candidate.row.min_stock));
          const sourceUnits = candidate.snapshot.branch.isWarehouse ? 0 : (candidate.snapshot.movement.get(sku) || 0);
          const sourceDaily = sourceUnits / LOOKBACK_DAYS;
          const safetyStock = Math.max(sourceMinimum * 1.5, sourceDaily > 0 ? Math.ceil(sourceDaily * SOURCE_SAFETY_DAYS) : sourceMinimum * 1.5, 1);
          const transferable = Math.max(0, Math.floor(sourceEffective - safetyStock));
          const sourceCover = daysCover(sourceEffective, sourceDaily);
          const slowRelativeToDestination = candidate.snapshot.branch.isWarehouse || destinationDaily === 0 || sourceDaily <= destinationDaily * 0.5 || (sourceCover != null && sourceCover >= 90);
          return { candidate, sourceStock, sourceCommitted, sourceEffective, sourceDaily, sourceCover, transferable, slowRelativeToDestination };
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

      const urgency: Recommendation["urgency"] = destinationEffective <= 0 ? "critical" : destinationEffective <= destinationMinimum ? "high" : "medium";
      const confidence: Recommendation["confidence"] = (destinationUnits >= 3 || source.candidate.snapshot.branch.isWarehouse) && coverageCount >= 3 ? "high" : "medium";
      const sourceLabel = source.candidate.snapshot.branch.isWarehouse
        ? "warehouse stock"
        : source.sourceDaily === 0
          ? `no recorded sales in ${LOOKBACK_DAYS} days`
          : `${source.sourceDaily.toFixed(2)} units/day vs ${destinationDaily.toFixed(2)} at destination`;
      const incomingLabel = destinationIncoming > 0 ? ` ${destinationIncoming} units are already inbound.` : "";
      const commitmentLabel = destinationCommitted > 0 ? ` ${destinationCommitted} units are committed to repairs/accepted quotes.` : "";

      recommendations.push({
        sku,
        productName: String(destination.row.name || source.candidate.row.name || sku),
        fromBranch: source.candidate.snapshot.branch.name,
        toBranch: destination.snapshot.branch.name,
        quantity,
        sourceStock: source.sourceStock,
        sourceCommitted: source.sourceCommitted,
        sourceEffective: source.sourceEffective,
        sourceDaily: source.sourceDaily,
        sourceDaysCover: source.sourceCover,
        destinationStock,
        destinationIncoming,
        destinationCommitted,
        destinationEffective,
        destinationMinimum,
        destinationDaily,
        destinationDaysCover: destinationCover,
        projectedSourceStock: source.sourceEffective - quantity,
        projectedDestinationStock: destinationEffective + quantity,
        urgency,
        confidence,
        reason: `${destination.snapshot.branch.name} is ${destinationEffective <= destinationMinimum ? "at/below its effective minimum" : "running below 21 days of effective cover"}.${incomingLabel}${commitmentLabel} ${source.candidate.snapshot.branch.name} has ${sourceLabel} and can release stock after protecting its own committed demand and safety stock.`,
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
  const [commitments, setCommitments] = useState<CommitmentState>({
    incomingTransfers: new Map(), incomingPurchaseOrders: new Map(), repairDemand: new Map(), quoteDemand: new Map(),
    coverage: { transfers: false, purchaseOrders: false, repairs: false, quotes: false },
  });

  async function load() {
    setLoading(true); setError("");
    try {
      const branches = await loadBranches();
      if (branches.length < 2) throw new Error("At least two branch/warehouse locations are required for transfer intelligence.");
      const end = new Date();
      const start = new Date(end.getTime() - (LOOKBACK_DAYS - 1) * 86400000);
      const [results, commitmentEvidence] = await Promise.all([
        Promise.all(branches.slice(0, 20).map((branch) => loadBranchSnapshot(branch, isoDate(start), isoDate(end)))),
        loadCommitments(),
      ]);
      setSnapshots(results);
      setCommitments(commitmentEvidence);
    } catch (cause) {
      const apiError = cause as OperationsApiError;
      setError(apiError.status === 403 ? "Inventory and Reports permissions are required for smart transfer recommendations." : apiError.message || "Smart transfer intelligence could not be loaded.");
      setSnapshots([]);
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);
  const recommendations = useMemo(() => buildRecommendations(snapshots, commitments), [snapshots, commitments]);
  const branchCount = snapshots.filter((item) => !item.branch.isWarehouse).length;
  const warehouseCount = snapshots.filter((item) => item.branch.isWarehouse).length;
  const coverageCount = Object.values(commitments.coverage).filter(Boolean).length;

  return <section className="sc-smart-transfer" data-guide-id="smart-transfer-recommendations">
    <div className="sc-smart-transfer__heading">
      <div><ArrowRightLeft size={19}/><div><span>Smart Transfer Intelligence</span><strong>Move slow stock before buying more</strong><p>Balances branch movement, inbound supply, repair demand and accepted quote commitments before recommending an inter-branch move.</p></div></div>
      <button type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/>{loading ? "Analyzing…" : "Recalculate"}</button>
    </div>

    <div className="sc-smart-transfer__metrics">
      <article><Boxes size={17}/><span>Locations analyzed</span><strong>{snapshots.length || "—"}</strong><small>{branchCount} stores · {warehouseCount} warehouses</small></article>
      <article><TrendingUp size={17}/><span>Transfer opportunities</span><strong>{loading ? "—" : recommendations.length}</strong><small>After inbound & committed demand</small></article>
      <article><TrendingDown size={17}/><span>Critical effective stockouts</span><strong>{loading ? "—" : recommendations.filter((item) => item.urgency === "critical").length}</strong><small>{coverageCount}/4 commitment sources available</small></article>
    </div>

    <div className="sc-smart-transfer__coverage" aria-label="Smart transfer evidence coverage">
      {Object.entries(commitments.coverage).map(([key, available]) => <span key={key} className={available ? "is-ready" : "is-missing"}>{key === "purchaseOrders" ? "Purchase orders" : key === "repairs" ? "Repair demand" : key === "quotes" ? "Accepted quotes" : "Transfers"}: {available ? "included" : "unavailable"}</span>)}
    </div>

    {error ? <div className="sc-ops-empty is-error"><strong>Smart transfer intelligence unavailable</strong><p>{error}</p></div> : null}
    {!error && !loading && !recommendations.length ? <div className="sc-ops-empty"><strong>No safe transfer opportunities found</strong><p>Inbound supply and committed demand were considered before deciding that another branch should release stock.</p></div> : null}

    {recommendations.length ? <div className="sc-smart-transfer__list">
      {recommendations.slice(0, 100).map((item) => <article key={`${item.sku}-${item.fromBranch}-${item.toBranch}`} className={`is-${item.urgency}`}>
        <div className="sc-smart-transfer__product"><em>{item.urgency}</em><div><strong>{item.productName}</strong><span>{item.sku}</span></div></div>
        <div className="sc-smart-transfer__route"><div><small>Move from</small><strong>{item.fromBranch}</strong><span>{item.sourceStock} on hand · {item.sourceCommitted} committed · {item.sourceDaily.toFixed(2)}/day</span></div><ArrowRightLeft size={17}/><div><small>Move to</small><strong>{item.toBranch}</strong><span>{item.destinationStock} on hand + {item.destinationIncoming} inbound − {item.destinationCommitted} committed</span></div></div>
        <div className="sc-smart-transfer__quantity"><small>Recommended qty</small><strong>{item.quantity}</strong><span>Projected effective: {item.projectedSourceStock} source · {item.projectedDestinationStock} destination</span></div>
        <p>{item.reason}</p>
        <div className="sc-smart-transfer__meta"><span>Effective destination {item.destinationEffective}</span><span>Destination minimum {item.destinationMinimum}</span><span>{item.destinationDaysCover == null ? "No destination sales history" : `${item.destinationDaysCover.toFixed(1)} days effective cover`}</span><span>{item.sourceDaysCover == null ? "Source has no store-sales velocity" : `${item.sourceDaysCover.toFixed(1)} source days cover`}</span><em className={`is-${item.confidence}`}>{item.confidence} confidence</em></div>
      </article>)}
    </div> : null}
    <p className="sc-smart-transfer__footnote">Credible inbound purchase orders are counted only when their expected date has not already passed. Overdue POs do not suppress transfer recommendations. Recommendations remain advisory; actual stock movement still uses the POS transfer workflow and its dispatch/receiving controls.</p>
  </section>;
}
