import { ArrowRightLeft, Boxes, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { operationsRequest, type OperationsApiError } from "../../lib/staffOperations";
import "../../styles/smart-transfer-recommendations.css";

type Row = Record<string, any>;
type Branch = { id: string; name: string; isWarehouse: boolean };
type BranchSnapshot = { branch: Branch; inventory: Row[]; recent: Map<string, number>; prior: Map<string, number> };
type EvidenceMap = Map<string, number>;
type CommitmentState = {
  incomingTransfers: EvidenceMap;
  incomingPurchaseOrders: EvidenceMap;
  repairDemand: EvidenceMap;
  quoteDemand: EvidenceMap;
  coverage: Record<"transfers" | "purchaseOrders" | "repairs" | "quotes", boolean>;
};
type DemandSignal = {
  recentUnits: number;
  priorUnits: number;
  forecastDaily: number;
  trendPct: number | null;
  direction: "accelerating" | "stable" | "declining" | "stagnant";
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
  sourceForecastDaily: number;
  sourceDaysCover: number | null;
  sourceDirection: DemandSignal["direction"];
  destinationStock: number;
  destinationIncoming: number;
  destinationCommitted: number;
  destinationEffective: number;
  destinationMinimum: number;
  destinationForecastDaily: number;
  destinationDaysCover: number | null;
  destinationDirection: DemandSignal["direction"];
  destinationTrendPct: number | null;
  targetDays: number;
  projectedSourceStock: number;
  projectedDestinationStock: number;
  urgency: "critical" | "high" | "medium";
  confidence: "high" | "medium";
  reason: string;
};

const WINDOW_DAYS = 30;
const BASE_TARGET_DAYS = 45;
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

function movementMap(rows: Row[]) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const sku = String(row.sku || "").trim();
    if (sku) map.set(sku, Math.max(0, n(row.units_sold)));
  }
  return map;
}

function demandSignal(snapshot: BranchSnapshot, sku: string): DemandSignal {
  if (snapshot.branch.isWarehouse) return { recentUnits: 0, priorUnits: 0, forecastDaily: 0, trendPct: null, direction: "stable" };
  const recentUnits = snapshot.recent.get(sku) || 0;
  const priorUnits = snapshot.prior.get(sku) || 0;
  const recentDaily = recentUnits / WINDOW_DAYS;
  const priorDaily = priorUnits / WINDOW_DAYS;
  if (recentUnits === 0 && priorUnits === 0) return { recentUnits, priorUnits, forecastDaily: 0, trendPct: null, direction: "stagnant" };
  const rawTrend = priorUnits > 0 ? (recentUnits - priorUnits) / priorUnits : recentUnits > 0 ? 1 : 0;
  const cappedTrend = Math.max(-0.5, Math.min(0.5, rawTrend));
  const weightedDaily = recentDaily * 0.7 + priorDaily * 0.3;
  const forecastDaily = Math.max(0, weightedDaily * (1 + cappedTrend * 0.5));
  const trendPct = priorUnits > 0 ? rawTrend * 100 : recentUnits > 0 ? 100 : null;
  const direction: DemandSignal["direction"] = rawTrend >= 0.25 ? "accelerating" : rawTrend <= -0.25 ? "declining" : "stable";
  return { recentUnits, priorUnits, forecastDaily, trendPct, direction };
}

function targetDays(signal: DemandSignal) {
  if (signal.direction === "accelerating") return 60;
  if (signal.direction === "declining") return 35;
  if (signal.direction === "stagnant") return 21;
  return BASE_TARGET_DAYS;
}

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

async function loadBranchSnapshot(branch: Branch, recentStart: string, recentEnd: string, priorStart: string, priorEnd: string): Promise<BranchSnapshot> {
  const inventoryPromise = operationsRequest<Row[]>(`inventory?branch_id=${encodeURIComponent(branch.id)}&active=1&is_service=0&is_rental=0&is_non_inventory=0`);
  if (branch.isWarehouse) {
    const inventory = await inventoryPromise;
    return { branch, inventory: Array.isArray(inventory) ? inventory : [], recent: new Map(), prior: new Map() };
  }
  const [inventory, recentRows, priorRows] = await Promise.all([
    inventoryPromise,
    operationsRequest<Row[]>(`reports/top-products?start=${recentStart}&end=${recentEnd}&branch_id=${encodeURIComponent(branch.id)}&limit=5000`),
    operationsRequest<Row[]>(`reports/top-products?start=${priorStart}&end=${priorEnd}&branch_id=${encodeURIComponent(branch.id)}&limit=5000`),
  ]);
  return {
    branch,
    inventory: Array.isArray(inventory) ? inventory : [],
    recent: movementMap(Array.isArray(recentRows) ? recentRows : []),
    prior: movementMap(Array.isArray(priorRows) ? priorRows : []),
  };
}

async function loadCommitments(): Promise<CommitmentState> {
  const state: CommitmentState = {
    incomingTransfers: new Map(), incomingPurchaseOrders: new Map(), repairDemand: new Map(), quoteDemand: new Map(),
    coverage: { transfers: false, purchaseOrders: false, repairs: false, quotes: false },
  };
  const [transferResult, poResult, woResult, quoteResult] = await Promise.allSettled([
    operationsRequest<Row[]>("transfers?limit=250"), operationsRequest<Row[]>("purchase-orders?limit=250"),
    operationsRequest<Row[]>("work-orders?view=active&limit=150"), operationsRequest<Row[]>("quotations?status=accepted&limit=150"),
  ]);

  if (transferResult.status === "fulfilled") {
    state.coverage.transfers = true;
    const open = transferResult.value.filter((row) => ["pending", "in_transit"].includes(String(row.status || "")));
    for (const transfer of await settledDetails(open, (row) => `transfers/${encodeURIComponent(String(row.id))}`)) {
      for (const item of Array.isArray(transfer.items) ? transfer.items : []) add(state.incomingTransfers, transfer.to_branch_id, item.sku, n(item.quantity_requested) - n(item.quantity_received));
    }
  }
  if (poResult.status === "fulfilled") {
    state.coverage.purchaseOrders = true;
    const now = Date.now();
    const open = poResult.value.filter((row) => !["received", "cancelled", "closed"].includes(String(row.status || "")));
    for (const po of await settledDetails(open, (row) => `purchase-orders/${encodeURIComponent(String(row.id))}`)) {
      const expected = po.expected_date ? new Date(String(po.expected_date)).getTime() : NaN;
      if (!Number.isFinite(expected) || expected < now - 86400000) continue;
      for (const item of Array.isArray(po.items) ? po.items : []) add(state.incomingPurchaseOrders, po.branch_id, item.sku, n(item.quantity_ordered) - n(item.quantity_received));
    }
  }
  if (woResult.status === "fulfilled") {
    state.coverage.repairs = true;
    for (const wo of await settledDetails(woResult.value, (row) => `work-orders/${encodeURIComponent(String(row.id))}`)) {
      for (const item of Array.isArray(wo.items) ? wo.items : []) {
        if (item.is_customer_supplied) continue;
        const sourcedElsewhere = (Array.isArray(item.sources) ? item.sources : []).reduce((sum: number, source: Row) => sum + Math.max(0, n(source.quantity)), 0);
        add(state.repairDemand, wo.branch_id, item.sku, Math.max(0, n(item.quantity) - sourcedElsewhere));
      }
    }
  }
  if (quoteResult.status === "fulfilled") {
    state.coverage.quotes = true;
    for (const quote of await settledDetails(quoteResult.value, (row) => `quotations/${encodeURIComponent(String(row.id))}`)) {
      for (const item of Array.isArray(quote.items) ? quote.items : []) {
        if (!item.sku) continue;
        const externallySourced = (Array.isArray(item.sources) ? item.sources : []).reduce((sum: number, source: Row) => sum + Math.max(0, n(source.quantity)), 0);
        add(state.quoteDemand, quote.branch_id, item.sku, Math.max(0, n(item.quantity) - externallySourced));
      }
    }
  }
  return state;
}

function buildRecommendations(snapshots: BranchSnapshot[], commitments: CommitmentState): Recommendation[] {
  const bySku = new Map<string, Array<{ snapshot: BranchSnapshot; row: Row }>>();
  for (const snapshot of snapshots) for (const row of snapshot.inventory) {
    const sku = String(row.sku || "").trim(); if (!sku) continue;
    const list = bySku.get(sku) || []; list.push({ snapshot, row }); bySku.set(sku, list);
  }

  const recommendations: Recommendation[] = [];
  const coverageCount = Object.values(commitments.coverage).filter(Boolean).length;
  for (const [sku, positions] of bySku.entries()) {
    for (const destination of positions) {
      if (destination.snapshot.branch.isWarehouse) continue;
      const branchId = destination.snapshot.branch.id;
      const destinationStock = Math.max(0, n(destination.row.stock_qty));
      const destinationMinimum = Math.max(0, n(destination.row.min_stock));
      const destinationIncoming = get(commitments.incomingTransfers, branchId, sku) + get(commitments.incomingPurchaseOrders, branchId, sku);
      const destinationCommitted = get(commitments.repairDemand, branchId, sku) + get(commitments.quoteDemand, branchId, sku);
      const destinationEffective = Math.max(0, destinationStock + destinationIncoming - destinationCommitted);
      const destinationSignal = demandSignal(destination.snapshot, sku);
      const destinationCover = daysCover(destinationEffective, destinationSignal.forecastDaily);
      const atRisk = destinationEffective <= destinationMinimum || (destinationSignal.forecastDaily > 0 && (destinationCover ?? Infinity) < LOW_COVER_DAYS);
      if (!atRisk) continue;

      const forwardDays = targetDays(destinationSignal);
      const targetStock = Math.max(destinationMinimum * 2, destinationSignal.forecastDaily > 0 ? Math.ceil(destinationSignal.forecastDaily * forwardDays) : destinationMinimum * 2, destinationMinimum + 1);
      const destinationNeed = Math.max(1, Math.ceil(targetStock - destinationEffective));

      const candidates = positions.filter((candidate) => candidate.snapshot.branch.id !== branchId).map((candidate) => {
        const sourceBranchId = candidate.snapshot.branch.id;
        const sourceStock = Math.max(0, n(candidate.row.stock_qty));
        const sourceCommitted = get(commitments.repairDemand, sourceBranchId, sku) + get(commitments.quoteDemand, sourceBranchId, sku);
        const sourceEffective = Math.max(0, sourceStock - sourceCommitted);
        const sourceMinimum = Math.max(0, n(candidate.row.min_stock));
        const signal = demandSignal(candidate.snapshot, sku);
        const safetyDays = signal.direction === "accelerating" ? 60 : signal.direction === "declining" ? 35 : SOURCE_SAFETY_DAYS;
        const safetyStock = Math.max(sourceMinimum * 1.5, signal.forecastDaily > 0 ? Math.ceil(signal.forecastDaily * safetyDays) : sourceMinimum * 1.5, 1);
        const transferable = Math.max(0, Math.floor(sourceEffective - safetyStock));
        const sourceCover = daysCover(sourceEffective, signal.forecastDaily);
        const slowRelativeToDestination = candidate.snapshot.branch.isWarehouse || signal.direction === "stagnant" || signal.forecastDaily <= destinationSignal.forecastDaily * 0.5 || (sourceCover != null && sourceCover >= 90);
        return { candidate, sourceStock, sourceCommitted, sourceEffective, signal, sourceCover, transferable, slowRelativeToDestination };
      }).filter((entry) => entry.transferable > 0 && entry.slowRelativeToDestination).sort((a, b) => {
        if (a.candidate.snapshot.branch.isWarehouse !== b.candidate.snapshot.branch.isWarehouse) return a.candidate.snapshot.branch.isWarehouse ? -1 : 1;
        if (a.signal.direction !== b.signal.direction) {
          const donorRank = { stagnant: 4, declining: 3, stable: 2, accelerating: 1 };
          return donorRank[b.signal.direction] - donorRank[a.signal.direction];
        }
        return b.transferable - a.transferable || (b.sourceCover ?? 9999) - (a.sourceCover ?? 9999);
      });

      const source = candidates[0]; if (!source) continue;
      const quantity = Math.min(destinationNeed, source.transferable); if (quantity <= 0) continue;
      const urgency: Recommendation["urgency"] = destinationEffective <= 0 ? "critical" : destinationEffective <= destinationMinimum ? "high" : "medium";
      const demandEvidence = destinationSignal.recentUnits + destinationSignal.priorUnits;
      const confidence: Recommendation["confidence"] = (demandEvidence >= 4 || source.candidate.snapshot.branch.isWarehouse) && coverageCount >= 3 ? "high" : "medium";
      const trendLabel = destinationSignal.direction === "accelerating" ? "accelerating demand" : destinationSignal.direction === "declining" ? "declining demand" : destinationSignal.direction === "stagnant" ? "no recent movement" : "stable demand";
      const incomingLabel = destinationIncoming > 0 ? ` ${destinationIncoming} units are already inbound.` : "";
      const commitmentLabel = destinationCommitted > 0 ? ` ${destinationCommitted} units are committed to repairs/accepted quotes.` : "";
      const sourceLabel = source.candidate.snapshot.branch.isWarehouse ? "warehouse supply" : `${source.signal.direction} source demand`;

      recommendations.push({
        sku, productName: String(destination.row.name || source.candidate.row.name || sku),
        fromBranch: source.candidate.snapshot.branch.name, toBranch: destination.snapshot.branch.name, quantity,
        sourceStock: source.sourceStock, sourceCommitted: source.sourceCommitted, sourceEffective: source.sourceEffective,
        sourceForecastDaily: source.signal.forecastDaily, sourceDaysCover: source.sourceCover, sourceDirection: source.signal.direction,
        destinationStock, destinationIncoming, destinationCommitted, destinationEffective, destinationMinimum,
        destinationForecastDaily: destinationSignal.forecastDaily, destinationDaysCover: destinationCover,
        destinationDirection: destinationSignal.direction, destinationTrendPct: destinationSignal.trendPct, targetDays: forwardDays,
        projectedSourceStock: source.sourceEffective - quantity, projectedDestinationStock: destinationEffective + quantity,
        urgency, confidence,
        reason: `${destination.snapshot.branch.name} is ${destinationEffective <= destinationMinimum ? "at/below its effective minimum" : "below its forward cover threshold"} with ${trendLabel}; its target was adjusted to ${forwardDays} days.${incomingLabel}${commitmentLabel} ${source.candidate.snapshot.branch.name} has ${sourceLabel} and can release stock after protecting its own forward demand, commitments and safety stock.`,
      });
    }
  }
  return recommendations.sort((a, b) => {
    const rank = { critical: 3, high: 2, medium: 1 };
    const directionRank = { accelerating: 4, stable: 3, declining: 2, stagnant: 1 };
    return rank[b.urgency] - rank[a.urgency] || directionRank[b.destinationDirection] - directionRank[a.destinationDirection] || b.destinationForecastDaily - a.destinationForecastDaily || b.quantity - a.quantity;
  });
}

export default function SmartTransferRecommendations() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [snapshots, setSnapshots] = useState<BranchSnapshot[]>([]);
  const [commitments, setCommitments] = useState<CommitmentState>({ incomingTransfers: new Map(), incomingPurchaseOrders: new Map(), repairDemand: new Map(), quoteDemand: new Map(), coverage: { transfers: false, purchaseOrders: false, repairs: false, quotes: false } });

  async function load() {
    setLoading(true); setError("");
    try {
      const branches = await loadBranches();
      if (branches.length < 2) throw new Error("At least two branch/warehouse locations are required for transfer intelligence.");
      const recentEnd = new Date();
      const recentStart = new Date(recentEnd.getTime() - (WINDOW_DAYS - 1) * 86400000);
      const priorEnd = new Date(recentStart.getTime() - 86400000);
      const priorStart = new Date(priorEnd.getTime() - (WINDOW_DAYS - 1) * 86400000);
      const [results, commitmentEvidence] = await Promise.all([
        Promise.all(branches.slice(0, 20).map((branch) => loadBranchSnapshot(branch, isoDate(recentStart), isoDate(recentEnd), isoDate(priorStart), isoDate(priorEnd)))),
        loadCommitments(),
      ]);
      setSnapshots(results); setCommitments(commitmentEvidence);
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
    <div className="sc-smart-transfer__heading"><div><ArrowRightLeft size={19}/><div><span>Smart Transfer Intelligence</span><strong>Move inventory where demand is heading</strong><p>Uses two 30-day demand windows, current commitments and credible inbound supply to produce forward-looking transfer targets instead of flat reorder quantities.</p></div></div><button type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/>{loading ? "Analyzing…" : "Recalculate"}</button></div>

    <div className="sc-smart-transfer__metrics">
      <article><Boxes size={17}/><span>Locations analyzed</span><strong>{snapshots.length || "—"}</strong><small>{branchCount} stores · {warehouseCount} warehouses</small></article>
      <article><TrendingUp size={17}/><span>Transfer opportunities</span><strong>{loading ? "—" : recommendations.length}</strong><small>{recommendations.filter((item) => item.destinationDirection === "accelerating").length} with accelerating demand</small></article>
      <article><TrendingDown size={17}/><span>Critical effective stockouts</span><strong>{loading ? "—" : recommendations.filter((item) => item.urgency === "critical").length}</strong><small>{coverageCount}/4 commitment sources available</small></article>
    </div>

    <div className="sc-smart-transfer__coverage" aria-label="Smart transfer evidence coverage">{Object.entries(commitments.coverage).map(([key, available]) => <span key={key} className={available ? "is-ready" : "is-missing"}>{key === "purchaseOrders" ? "Purchase orders" : key === "repairs" ? "Repair demand" : key === "quotes" ? "Accepted quotes" : "Transfers"}: {available ? "included" : "unavailable"}</span>)}</div>

    {error ? <div className="sc-ops-empty is-error"><strong>Smart transfer intelligence unavailable</strong><p>{error}</p></div> : null}
    {!error && !loading && !recommendations.length ? <div className="sc-ops-empty"><strong>No safe transfer opportunities found</strong><p>Forward demand, inbound supply and committed demand were considered before deciding that another location should release stock.</p></div> : null}

    {recommendations.length ? <div className="sc-smart-transfer__list">{recommendations.slice(0, 100).map((item) => <article key={`${item.sku}-${item.fromBranch}-${item.toBranch}`} className={`is-${item.urgency}`}>
      <div className="sc-smart-transfer__product"><em>{item.urgency}</em><div><strong>{item.productName}</strong><span>{item.sku}</span></div></div>
      <div className="sc-smart-transfer__route"><div><small>Move from</small><strong>{item.fromBranch}</strong><span>{item.sourceStock} on hand · {item.sourceCommitted} committed · {item.sourceDirection}</span></div><ArrowRightLeft size={17}/><div><small>Move to</small><strong>{item.toBranch}</strong><span>{item.destinationStock} on hand + {item.destinationIncoming} inbound − {item.destinationCommitted} committed</span></div></div>
      <div className="sc-smart-transfer__quantity"><small>Recommended qty</small><strong>{item.quantity}</strong><span>Projected effective: {item.projectedSourceStock} source · {item.projectedDestinationStock} destination</span></div>
      <p>{item.reason}</p>
      <div className="sc-smart-transfer__meta"><span>{item.destinationDirection} destination demand</span><span>{item.destinationTrendPct == null ? "No trend baseline" : `${item.destinationTrendPct > 0 ? "+" : ""}${Math.round(item.destinationTrendPct)}% vs prior 30d`}</span><span>{item.targetDays}-day target</span><span>{item.destinationForecastDaily.toFixed(2)} forecast units/day</span><span>{item.destinationDaysCover == null ? "No forecast cover" : `${item.destinationDaysCover.toFixed(1)} days effective cover`}</span><em className={`is-${item.confidence}`}>{item.confidence} confidence</em></div>
    </article>)}</div> : null}
    <p className="sc-smart-transfer__footnote">Forecasting uses two complete 30-day movement windows, weights the recent window more heavily, and caps trend adjustment to reduce overreaction to one unusual period. Accelerating demand receives a longer target horizon; declining and stagnant demand receive shorter targets. Actual stock movement still requires the POS transfer workflow.</p>
  </section>;
}
