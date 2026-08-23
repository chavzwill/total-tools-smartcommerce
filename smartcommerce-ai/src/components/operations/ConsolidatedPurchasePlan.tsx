import { ClipboardList, RefreshCw, ShieldCheck, ShoppingCart, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { operationsRequest, type OperationsApiError } from "../../lib/staffOperations";
import "../../styles/consolidated-purchase-plan.css";

type Row = Record<string, any>;
type Branch = { id: string; name: string; isWarehouse: boolean };
type Snapshot = { branch: Branch; inventory: Row[]; recent: Map<string, number>; prior: Map<string, number> };
type SupplierPick = { supplierId: string; supplierName: string; sku: string; score: number; avgCost: number | null; leadDays: number | null; fill: number; onTime: number };
type BuyLine = { branchId: string; branchName: string; sku: string; name: string; quantity: number; target: number; effective: number; supplier?: SupplierPick };

type PlanGroup = { key: string; supplierId?: string; supplierName: string; branchId: string; branchName: string; lines: BuyLine[]; estimated: number | null };

const WINDOW = 30;
const DETAIL_LIMIT = 180;
const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const iso = (date: Date) => date.toISOString().slice(0, 10);
const key = (branch: unknown, sku: unknown) => `${String(branch ?? "")}::${String(sku ?? "").trim()}`;
const money = (value: number) => new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", maximumFractionDigits: 0 }).format(value || 0);

function movement(rows: Row[]) {
  const map = new Map<string, number>();
  for (const row of rows) { const sku = String(row.sku || "").trim(); if (sku) map.set(sku, Math.max(0, n(row.units_sold))); }
  return map;
}

function forecast(recent: number, prior: number) {
  const recentDaily = recent / WINDOW, priorDaily = prior / WINDOW;
  const raw = prior > 0 ? (recent - prior) / prior : recent > 0 ? 1 : 0;
  const capped = Math.max(-0.5, Math.min(0.5, raw));
  return Math.max(0, (recentDaily * 0.7 + priorDaily * 0.3) * (1 + capped * 0.5));
}

async function loadBranches(): Promise<Branch[]> {
  const [dashboard, inventoryReport] = await Promise.all([operationsRequest<any>("reports/dashboard"), operationsRequest<any>("reports/inventory")]);
  const out: Branch[] = []; const seen = new Set<string>();
  for (const row of Array.isArray(dashboard?.byLocation) ? dashboard.byLocation : []) { const id = String(row.id || ""); if (!id || seen.has(id)) continue; seen.add(id); out.push({ id, name: String(row.name || `Branch ${id}`), isWarehouse: false }); }
  for (const row of Array.isArray(inventoryReport?.warehouseValue) ? inventoryReport.warehouseValue : []) { const id = String(row.branch_id || ""); if (!id || seen.has(id)) continue; seen.add(id); out.push({ id, name: String(row.branch_name || `Warehouse ${id}`), isWarehouse: true }); }
  return out;
}

async function loadSnapshot(branch: Branch, rs: string, re: string, ps: string, pe: string): Promise<Snapshot> {
  const inventoryPromise = operationsRequest<Row[]>(`inventory?branch_id=${encodeURIComponent(branch.id)}&active=1&is_service=0&is_rental=0&is_non_inventory=0`);
  if (branch.isWarehouse) return { branch, inventory: await inventoryPromise, recent: new Map(), prior: new Map() };
  const [inventory, recent, prior] = await Promise.all([
    inventoryPromise,
    operationsRequest<Row[]>(`reports/top-products?start=${rs}&end=${re}&branch_id=${encodeURIComponent(branch.id)}&limit=5000`),
    operationsRequest<Row[]>(`reports/top-products?start=${ps}&end=${pe}&branch_id=${encodeURIComponent(branch.id)}&limit=5000`),
  ]);
  return { branch, inventory, recent: movement(recent), prior: movement(prior) };
}

async function loadInbound() {
  const map = new Map<string, number>();
  const add = (branchId: unknown, sku: unknown, qty: number) => { if (!branchId || !sku || qty <= 0) return; const k = key(branchId, sku); map.set(k, (map.get(k) || 0) + qty); };
  const [transferResult, poResult] = await Promise.allSettled([operationsRequest<Row[]>("transfers?limit=250"), operationsRequest<Row[]>("purchase-orders?limit=250")]);
  if (transferResult.status === "fulfilled") {
    const rows = transferResult.value.filter((row) => ["pending", "in_transit"].includes(String(row.status || ""))).slice(0, DETAIL_LIMIT);
    const details = await Promise.allSettled(rows.map((row) => operationsRequest<Row>(`transfers/${encodeURIComponent(String(row.id))}`)));
    for (const result of details) if (result.status === "fulfilled") for (const item of Array.isArray(result.value.items) ? result.value.items : []) add(result.value.to_branch_id, item.sku, Math.max(0, n(item.quantity_requested) - n(item.quantity_received)));
  }
  if (poResult.status === "fulfilled") {
    const now = Date.now();
    const rows = poResult.value.filter((row) => !["received", "cancelled", "closed"].includes(String(row.status || ""))).slice(0, DETAIL_LIMIT);
    const details = await Promise.allSettled(rows.map((row) => operationsRequest<Row>(`purchase-orders/${encodeURIComponent(String(row.id))}`)));
    for (const result of details) if (result.status === "fulfilled") {
      const po = result.value; const expected = new Date(String(po.expected_date || "")).getTime(); if (!Number.isFinite(expected) || expected < now - 86400000) continue;
      for (const item of Array.isArray(po.items) ? po.items : []) add(po.branch_id, item.sku, Math.max(0, n(item.quantity_ordered) - n(item.quantity_received)));
    }
  }
  return map;
}

async function loadSupplierPicks() {
  const [poRows, supplierRows] = await Promise.all([operationsRequest<Row[]>("purchase-orders?limit=500"), operationsRequest<Row[]>("suppliers?active=true")]);
  const supplierNames = new Map((Array.isArray(supplierRows) ? supplierRows : []).map((row) => [String(row.id), String(row.name || `Supplier ${row.id}`)]));
  const detailsResult = await Promise.allSettled((Array.isArray(poRows) ? poRows : []).slice(0, DETAIL_LIMIT).map((row) => operationsRequest<Row>(`purchase-orders/${encodeURIComponent(String(row.id))}`)));
  const details = detailsResult.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  const evidence = new Map<string, { supplierId: string; supplierName: string; sku: string; orders: number; measurable: number; ordered: number; received: number; onTime: number; dated: number; leads: number[]; costValue: number; costUnits: number }>();
  const now = Date.now();
  for (const po of details) {
    if (String(po.status || "") === "cancelled") continue;
    const supplierId = String(po.supplier_id || ""); if (!supplierId) continue;
    const receivedAt = po.received_at ? new Date(String(po.received_at)).getTime() : NaN;
    const expectedAt = po.expected_date ? new Date(String(po.expected_date)).getTime() : NaN;
    const measurable = String(po.status || "") === "received" || (Number.isFinite(expectedAt) && expectedAt < now);
    const lead = Number.isFinite(receivedAt) ? Math.max(0, (receivedAt - new Date(String(po.created_at || "")).getTime()) / 86400000) : null;
    for (const item of Array.isArray(po.items) ? po.items : []) {
      const sku = String(item.sku || "").trim(); if (!sku) continue;
      const k = `${supplierId}::${sku}`;
      const e = evidence.get(k) || { supplierId, supplierName: String(po.supplier_name || supplierNames.get(supplierId) || `Supplier ${supplierId}`), sku, orders: 0, measurable: 0, ordered: 0, received: 0, onTime: 0, dated: 0, leads: [], costValue: 0, costUnits: 0 };
      e.orders += 1;
      const ordered = Math.max(0, n(item.quantity_ordered)), received = Math.max(0, n(item.quantity_received));
      if (measurable) { e.measurable += 1; e.ordered += ordered; e.received += Math.min(ordered, received); }
      if (Number.isFinite(receivedAt) && Number.isFinite(expectedAt)) { e.dated += 1; if (receivedAt <= expectedAt + 86400000) e.onTime += 1; }
      if (lead != null && Number.isFinite(lead)) e.leads.push(lead);
      const cost = Math.max(0, n(item.unit_cost)); if (cost > 0 && ordered > 0) { e.costValue += cost * ordered; e.costUnits += ordered; }
      evidence.set(k, e);
    }
  }
  const grouped = new Map<string, typeof evidence extends Map<any, infer V> ? V[] : never>();
  for (const e of evidence.values()) { const rows = grouped.get(e.sku) || []; rows.push(e); grouped.set(e.sku, rows); }
  const picks = new Map<string, SupplierPick>();
  for (const [sku, rows] of grouped) {
    const usable = rows.filter((e) => e.orders >= 3 && e.measurable >= 2 && e.dated >= 2); if (!usable.length) continue;
    const costs = usable.map((e) => e.costUnits ? e.costValue / e.costUnits : null).filter((v): v is number => v != null && v > 0); const minCost = costs.length ? Math.min(...costs) : null;
    const maxLead = Math.max(1, ...usable.flatMap((e) => e.leads));
    const ranked = usable.map((e) => {
      const fill = e.ordered > 0 ? Math.min(100, e.received / e.ordered * 100) : 50;
      const onTime = e.dated ? e.onTime / e.dated * 100 : 50;
      const leadDays = e.leads.length ? e.leads.reduce((a, b) => a + b, 0) / e.leads.length : null;
      const avgCost = e.costUnits ? e.costValue / e.costUnits : null;
      const leadScore = leadDays == null ? 50 : Math.max(0, 100 - (leadDays / maxLead) * 70);
      const costScore = avgCost == null || minCost == null ? 50 : Math.max(0, Math.min(100, minCost / avgCost * 100));
      const score = onTime * .35 + fill * .30 + costScore * .20 + leadScore * .15;
      return { supplierId: e.supplierId, supplierName: e.supplierName, sku, score, avgCost, leadDays, fill, onTime };
    }).sort((a, b) => b.score - a.score);
    picks.set(sku, ranked[0]);
  }
  return picks;
}

function buildBuyLines(snapshots: Snapshot[], inbound: Map<string, number>, supplierPicks: Map<string, SupplierPick>): BuyLine[] {
  const bySku = new Map<string, Array<{ snap: Snapshot; row: Row }>>();
  for (const snap of snapshots) for (const row of snap.inventory) { const sku = String(row.sku || "").trim(); if (!sku) continue; const list = bySku.get(sku) || []; list.push({ snap, row }); bySku.set(sku, list); }
  const lines: BuyLine[] = [];
  for (const [sku, positions] of bySku) for (const destination of positions) {
    if (destination.snap.branch.isWarehouse) continue;
    const stock = Math.max(0, n(destination.row.stock_qty)), minimum = Math.max(0, n(destination.row.min_stock));
    const recent = destination.snap.recent.get(sku) || 0, prior = destination.snap.prior.get(sku) || 0, daily = forecast(recent, prior);
    const horizon = recent > prior * 1.25 ? 60 : recent < prior * .75 ? 35 : 45;
    const target = Math.max(minimum * 2, daily > 0 ? Math.ceil(daily * horizon) : minimum * 2, minimum + 1);
    const inboundQty = inbound.get(key(destination.snap.branch.id, sku)) || 0, effective = stock + inboundQty;
    if (effective >= target) continue;
    const shortfall = Math.max(1, Math.ceil(target - effective));
    const donor = positions.filter((p) => p.snap.branch.id !== destination.snap.branch.id).some((p) => {
      const donorStock = Math.max(0, n(p.row.stock_qty)), donorMin = Math.max(0, n(p.row.min_stock));
      const dr = p.snap.branch.isWarehouse ? 0 : (p.snap.recent.get(sku) || 0), dp = p.snap.branch.isWarehouse ? 0 : (p.snap.prior.get(sku) || 0), dd = forecast(dr, dp);
      const safety = Math.max(donorMin * 1.5, dd > 0 ? Math.ceil(dd * 45) : donorMin * 1.5, 1);
      return donorStock - safety >= shortfall && (p.snap.branch.isWarehouse || (dr === 0 && dp === 0) || dd <= daily * .5);
    });
    if (donor) continue;
    if (inboundQty > 0 && effective >= Math.max(minimum + 1, Math.ceil(target * .8))) continue;
    lines.push({ branchId: destination.snap.branch.id, branchName: destination.snap.branch.name, sku, name: String(destination.row.name || sku), quantity: shortfall, target, effective, supplier: supplierPicks.get(sku) });
  }
  return lines;
}

function groupPlan(lines: BuyLine[]): PlanGroup[] {
  const map = new Map<string, PlanGroup>();
  for (const line of lines) {
    const supplierId = line.supplier?.supplierId;
    const groupKey = `${line.branchId}::${supplierId || "review"}`;
    const group = map.get(groupKey) || { key: groupKey, supplierId, supplierName: line.supplier?.supplierName || "Supplier review required", branchId: line.branchId, branchName: line.branchName, lines: [], estimated: 0 };
    group.lines.push(line);
    if (line.supplier?.avgCost != null) group.estimated = (group.estimated || 0) + line.quantity * line.supplier.avgCost; else group.estimated = null;
    map.set(groupKey, group);
  }
  return [...map.values()].sort((a, b) => Number(Boolean(b.supplierId)) - Number(Boolean(a.supplierId)) || b.lines.length - a.lines.length);
}

export default function ConsolidatedPurchasePlan() {
  const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [groups, setGroups] = useState<PlanGroup[]>([]);
  async function load() {
    setLoading(true); setError("");
    try {
      const locations = await loadBranches(); const recentEnd = new Date(); const recentStart = new Date(recentEnd.getTime() - 29 * 86400000); const priorEnd = new Date(recentStart.getTime() - 86400000); const priorStart = new Date(priorEnd.getTime() - 29 * 86400000);
      const [snapshots, inbound, supplierPicks] = await Promise.all([
        Promise.all(locations.slice(0, 20).map((b) => loadSnapshot(b, iso(recentStart), iso(recentEnd), iso(priorStart), iso(priorEnd)))),
        loadInbound(), loadSupplierPicks(),
      ]);
      setGroups(groupPlan(buildBuyLines(snapshots, inbound, supplierPicks)));
    } catch (cause) { const e = cause as OperationsApiError; setError(e.status === 403 ? "Inventory, Reports, Purchasing, Transfers and Supplier access are required for the consolidated purchase plan." : e.message || "Purchase plan could not be calculated."); setGroups([]); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const totalLines = groups.reduce((sum, g) => sum + g.lines.length, 0); const readyGroups = groups.filter((g) => g.supplierId).length; const estimated = groups.every((g) => g.estimated != null) ? groups.reduce((sum, g) => sum + Number(g.estimated || 0), 0) : null;
  return <section className="sc-purchase-plan" data-guide-id="consolidated-purchase-plan">
    <div className="sc-purchase-plan__heading"><div><ClipboardList size={19}/><div><span>Consolidated Purchase Plan</span><strong>Turn BUY signals into supplier-ready order groups</strong><p>Groups unresolved replenishment shortfalls by branch and evidence-backed preferred supplier. Learning-only SKUs remain in manual supplier review.</p></div></div><button type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/>{loading ? "Planning…" : "Recalculate"}</button></div>
    <div className="sc-purchase-plan__metrics"><article><ShoppingCart size={17}/><span>Purchase lines</span><strong>{loading ? "—" : totalLines}</strong><small>After inbound and transfer checks</small></article><article><ShieldCheck size={17}/><span>Supplier-ready groups</span><strong>{loading ? "—" : readyGroups}</strong><small>Usable SKU supplier evidence</small></article><article><Truck size={17}/><span>Estimated cost</span><strong>{loading || estimated == null ? "—" : money(estimated)}</strong><small>{estimated == null ? "Some lines require supplier/cost review" : "Historical weighted unit cost"}</small></article></div>
    {error ? <div className="sc-ops-empty is-error"><strong>Purchase plan unavailable</strong><p>{error}</p></div> : null}
    {!error && !loading && !groups.length ? <div className="sc-ops-empty"><strong>No purchase plan required</strong><p>Current forward needs are covered by stock, credible inbound, or safe internal transfers.</p></div> : null}
    {groups.length ? <div className="sc-purchase-plan__groups">{groups.map((group) => <article key={group.key} className={group.supplierId ? "is-ready" : "is-review"}><header><div><em>{group.supplierId ? "Supplier ready" : "Review supplier"}</em><strong>{group.supplierName}</strong><span>{group.branchName} · {group.lines.length} line{group.lines.length === 1 ? "" : "s"}</span></div><div><small>Estimated group value</small><strong>{group.estimated == null ? "Pending cost review" : money(group.estimated)}</strong></div></header><div className="sc-purchase-plan__lines">{group.lines.map((line) => <div key={`${group.key}-${line.sku}`}><div><strong>{line.name}</strong><span>{line.sku}</span></div><div><small>Buy qty</small><strong>{line.quantity}</strong></div><div><small>Effective / target</small><strong>{line.effective} / {line.target}</strong></div><div><small>Supplier evidence</small><strong>{line.supplier ? `${Math.round(line.supplier.score)}/100` : "Learning"}</strong><span>{line.supplier ? `${Math.round(line.supplier.fill)}% fill · ${Math.round(line.supplier.onTime)}% on-time${line.supplier.leadDays == null ? "" : ` · ${line.supplier.leadDays.toFixed(1)}d lead`}` : "Purchasing review required"}</span></div></div>)}</div></article>)}</div> : null}
    <p className="sc-purchase-plan__footnote">This is an advisory planning surface only. It never creates a purchase order automatically. Purchasing must review quantities, supplier choice, current quotes/currency/freight, terms and expected delivery before using the POS purchase-order workflow.</p>
  </section>;
}
