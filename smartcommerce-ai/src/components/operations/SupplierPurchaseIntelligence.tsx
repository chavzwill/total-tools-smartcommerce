import { BadgeDollarSign, Clock3, PackageCheck, RefreshCw, ShieldCheck, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { operationsRequest, type OperationsApiError } from "../../lib/staffOperations";
import "../../styles/supplier-purchase-intelligence.css";

type Row = Record<string, any>;
type Supplier = { id: string; name: string; isLocal: boolean };
type SupplierSkuEvidence = {
  supplierId: string;
  supplierName: string;
  sku: string;
  productName: string;
  isLocal: boolean;
  orders: number;
  measurableOrders: number;
  unitsOrdered: number;
  unitsReceived: number;
  weightedCostValue: number;
  weightedCostUnits: number;
  onTime: number;
  datedReceipts: number;
  leadDays: number[];
  lastCost: number | null;
  previousCost: number | null;
};
type RankedSupplier = SupplierSkuEvidence & {
  fillRate: number | null;
  onTimeRate: number | null;
  averageLead: number | null;
  averageUnitCost: number | null;
  costTrend: number | null;
  score: number | null;
  confidence: "usable" | "learning";
};

const DETAIL_LIMIT = 180;
const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const days = (start: unknown, end: unknown) => {
  const a = new Date(String(start || "")).getTime();
  const b = new Date(String(end || "")).getTime();
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, (b - a) / 86400000) : null;
};
const money = (value: number) => new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", maximumFractionDigits: 2 }).format(value || 0);

async function loadDetails(rows: Row[]) {
  const results = await Promise.allSettled(rows.slice(0, DETAIL_LIMIT).map((row) => operationsRequest<Row>(`purchase-orders/${encodeURIComponent(String(row.id))}`)));
  return results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
}

function evidence(details: Row[], suppliers: Supplier[]) {
  const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  const map = new Map<string, SupplierSkuEvidence>();
  const now = Date.now();

  for (const po of details) {
    if (String(po.status || "") === "cancelled") continue;
    const supplierId = String(po.supplier_id || "");
    if (!supplierId) continue;
    const supplier = supplierById.get(supplierId);
    const receivedAt = po.received_at ? new Date(String(po.received_at)).getTime() : NaN;
    const expectedAt = po.expected_date ? new Date(String(po.expected_date)).getTime() : NaN;
    const measurable = String(po.status || "") === "received" || (Number.isFinite(expectedAt) && expectedAt < now);
    const lead = Number.isFinite(receivedAt) ? days(po.created_at, po.received_at) : null;
    const receiptOnTime = Number.isFinite(receivedAt) && Number.isFinite(expectedAt) ? receivedAt <= expectedAt + 86400000 : null;

    for (const item of Array.isArray(po.items) ? po.items : []) {
      const sku = String(item.sku || "").trim();
      if (!sku) continue;
      const key = `${supplierId}::${sku}`;
      const current = map.get(key) || {
        supplierId,
        supplierName: String(po.supplier_name || supplier?.name || `Supplier ${supplierId}`),
        sku,
        productName: String(item.product_name || sku),
        isLocal: supplier?.isLocal || false,
        orders: 0,
        measurableOrders: 0,
        unitsOrdered: 0,
        unitsReceived: 0,
        weightedCostValue: 0,
        weightedCostUnits: 0,
        onTime: 0,
        datedReceipts: 0,
        leadDays: [],
        lastCost: null,
        previousCost: null,
      };
      current.orders += 1;
      const ordered = Math.max(0, n(item.quantity_ordered));
      const received = Math.max(0, n(item.quantity_received));
      if (measurable) {
        current.measurableOrders += 1;
        current.unitsOrdered += ordered;
        current.unitsReceived += Math.min(ordered, received);
      }
      const unitCost = Math.max(0, n(item.unit_cost));
      if (unitCost > 0 && ordered > 0) {
        current.weightedCostValue += unitCost * ordered;
        current.weightedCostUnits += ordered;
        current.previousCost = current.lastCost;
        current.lastCost = unitCost;
      }
      if (receiptOnTime != null) {
        current.datedReceipts += 1;
        if (receiptOnTime) current.onTime += 1;
      }
      if (lead != null) current.leadDays.push(lead);
      map.set(key, current);
    }
  }
  return [...map.values()];
}

function rank(rows: SupplierSkuEvidence[]): RankedSupplier[] {
  const bySku = new Map<string, SupplierSkuEvidence[]>();
  rows.forEach((row) => { const list = bySku.get(row.sku) || []; list.push(row); bySku.set(row.sku, list); });
  const ranked: RankedSupplier[] = [];

  for (const skuRows of bySku.values()) {
    const costRows = skuRows.map((row) => row.weightedCostUnits > 0 ? row.weightedCostValue / row.weightedCostUnits : null).filter((value): value is number => value != null && value > 0);
    const minCost = costRows.length ? Math.min(...costRows) : null;
    const maxLead = Math.max(1, ...skuRows.flatMap((row) => row.leadDays));

    for (const row of skuRows) {
      const fillRate = row.unitsOrdered > 0 ? Math.min(100, (row.unitsReceived / row.unitsOrdered) * 100) : null;
      const onTimeRate = row.datedReceipts > 0 ? (row.onTime / row.datedReceipts) * 100 : null;
      const averageLead = row.leadDays.length ? row.leadDays.reduce((sum, value) => sum + value, 0) / row.leadDays.length : null;
      const averageUnitCost = row.weightedCostUnits > 0 ? row.weightedCostValue / row.weightedCostUnits : null;
      const costTrend = row.lastCost != null && row.previousCost != null && row.previousCost > 0 ? ((row.lastCost - row.previousCost) / row.previousCost) * 100 : null;
      const confidence: RankedSupplier["confidence"] = row.orders >= 3 && row.measurableOrders >= 2 && row.datedReceipts >= 2 ? "usable" : "learning";

      let score: number | null = null;
      if (confidence === "usable") {
        const reliability = onTimeRate ?? 50;
        const fill = fillRate ?? 50;
        const leadScore = averageLead == null ? 50 : Math.max(0, 100 - (averageLead / maxLead) * 70);
        const costScore = averageUnitCost == null || minCost == null ? 50 : Math.max(0, Math.min(100, (minCost / averageUnitCost) * 100));
        score = reliability * 0.35 + fill * 0.30 + costScore * 0.20 + leadScore * 0.15;
      }
      ranked.push({ ...row, fillRate, onTimeRate, averageLead, averageUnitCost, costTrend, score, confidence });
    }
  }
  return ranked.sort((a, b) => {
    if (a.confidence !== b.confidence) return a.confidence === "usable" ? -1 : 1;
    return (b.score ?? -1) - (a.score ?? -1) || b.orders - a.orders;
  });
}

export default function SupplierPurchaseIntelligence() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [details, setDetails] = useState<Row[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  async function load() {
    setLoading(true); setError("");
    try {
      const [poRows, supplierRows] = await Promise.all([
        operationsRequest<Row[]>("purchase-orders?limit=500"),
        operationsRequest<Row[]>("suppliers?active=true"),
      ]);
      const supplierList = (Array.isArray(supplierRows) ? supplierRows : []).map((row) => ({ id: String(row.id), name: String(row.name || `Supplier ${row.id}`), isLocal: Boolean(row.is_local) }));
      setSuppliers(supplierList);
      setDetails(await loadDetails(Array.isArray(poRows) ? poRows : []));
    } catch (cause) {
      const e = cause as OperationsApiError;
      setError(e.status === 403 ? "Purchasing and supplier access are required for supplier preference intelligence." : e.message || "Supplier purchase intelligence could not be loaded.");
      setDetails([]); setSuppliers([]);
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);
  const rows = useMemo(() => rank(evidence(details, suppliers)), [details, suppliers]);
  const usable = rows.filter((row) => row.confidence === "usable");
  const preferred = useMemo(() => {
    const seen = new Set<string>();
    return usable.filter((row) => { if (seen.has(row.sku)) return false; seen.add(row.sku); return true; });
  }, [usable]);
  const averageFill = usable.filter((row) => row.fillRate != null).length ? usable.filter((row) => row.fillRate != null).reduce((sum, row) => sum + Number(row.fillRate), 0) / usable.filter((row) => row.fillRate != null).length : null;
  const averageOnTime = usable.filter((row) => row.onTimeRate != null).length ? usable.filter((row) => row.onTimeRate != null).reduce((sum, row) => sum + Number(row.onTimeRate), 0) / usable.filter((row) => row.onTimeRate != null).length : null;

  return <section className="sc-supplier-purchase" data-guide-id="supplier-purchase-intelligence">
    <div className="sc-supplier-purchase__heading"><div><Truck size={19}/><div><span>Supplier Purchase Intelligence</span><strong>Choose suppliers from proven SKU history</strong><p>Ranks supplier evidence by on-time delivery, measurable fill performance, SKU-specific cost history and lead time. Small samples remain in learning mode.</p></div></div><button type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/>{loading ? "Analyzing…" : "Recalculate"}</button></div>
    <div className="sc-supplier-purchase__metrics">
      <article><ShieldCheck size={17}/><span>Preferred SKU sources</span><strong>{loading ? "—" : preferred.length}</strong><small>Usable evidence only</small></article>
      <article><PackageCheck size={17}/><span>Average fill</span><strong>{loading || averageFill == null ? "—" : `${Math.round(averageFill)}%`}</strong><small>Measured due/received order lines</small></article>
      <article><Clock3 size={17}/><span>Average on-time</span><strong>{loading || averageOnTime == null ? "—" : `${Math.round(averageOnTime)}%`}</strong><small>Orders with expected + receipt dates</small></article>
    </div>
    {error ? <div className="sc-ops-empty is-error"><strong>Supplier intelligence unavailable</strong><p>{error}</p></div> : null}
    {!error && !loading && !rows.length ? <div className="sc-ops-empty"><strong>No supplier SKU history yet</strong><p>Rankings will appear after purchase orders establish measurable item-level history.</p></div> : null}
    {rows.length ? <div className="sc-supplier-purchase__list">{rows.slice(0, 120).map((row, index) => <article key={`${row.supplierId}-${row.sku}`} className={row.confidence === "usable" ? "is-usable" : "is-learning"}>
      <div className="sc-supplier-purchase__identity"><em>{row.confidence === "usable" && preferred.some((item) => item.sku === row.sku && item.supplierId === row.supplierId) ? "Preferred" : row.confidence === "usable" ? "Ranked" : "Learning"}</em><strong>{row.productName}</strong><span>{row.sku} · {row.supplierName}{row.isLocal ? " · Local" : ""}</span></div>
      <div><small>Score</small><strong>{row.score == null ? "—" : `${Math.round(row.score)}/100`}</strong><span>{row.orders} historical orders</span></div>
      <div><small>Fill rate</small><strong>{row.fillRate == null ? "—" : `${Math.round(row.fillRate)}%`}</strong><span>{row.measurableOrders} measurable orders</span></div>
      <div><small>On-time</small><strong>{row.onTimeRate == null ? "—" : `${Math.round(row.onTimeRate)}%`}</strong><span>{row.averageLead == null ? "Lead time unavailable" : `${row.averageLead.toFixed(1)}d avg lead`}</span></div>
      <div><small>Avg unit cost</small><strong>{row.averageUnitCost == null ? "—" : money(row.averageUnitCost)}</strong><span>{row.costTrend == null ? "Cost trend learning" : `${row.costTrend > 0 ? "+" : ""}${Math.round(row.costTrend)}% latest vs prior`}</span></div>
    </article>)}</div> : null}
    <div className="sc-supplier-purchase__policy"><BadgeDollarSign size={16}/><p><strong>Decision policy:</strong> supplier score = 35% on-time delivery + 30% measurable fill + 20% SKU cost competitiveness + 15% lead-time performance. A supplier is not ranked as usable until it has at least 3 SKU orders, 2 measurable orders and 2 dated receipts. Local status is displayed but does not artificially increase the score.</p></div>
  </section>;
}
