import { ArrowRightLeft, Clock3, PackagePlus, RefreshCw, ShoppingCart } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { operationsRequest, type OperationsApiError } from "../../lib/staffOperations";
import "../../styles/replenishment-decision-board.css";

type Row = Record<string, any>;
type Branch = { id: string; name: string; isWarehouse: boolean };
type Snapshot = { branch: Branch; inventory: Row[]; recent: Map<string, number>; prior: Map<string, number> };
type InboundMap = Map<string, number>;
type Decision = { sku: string; name: string; branch: string; action: "wait" | "transfer" | "buy"; quantity: number; effective: number; target: number; forecastDaily: number; donor?: string; inbound: number; rationale: string };

const WINDOW = 30;
const DETAIL_LIMIT = 80;
const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const iso = (date: Date) => date.toISOString().slice(0, 10);
const key = (branch: unknown, sku: unknown) => `${String(branch ?? "")}::${String(sku ?? "").trim()}`;

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

async function branches(): Promise<Branch[]> {
  const [dashboard, inventoryReport] = await Promise.all([operationsRequest<any>("reports/dashboard"), operationsRequest<any>("reports/inventory")]);
  const out: Branch[] = []; const seen = new Set<string>();
  for (const row of Array.isArray(dashboard?.byLocation) ? dashboard.byLocation : []) { const id = String(row.id || ""); if (!id || seen.has(id)) continue; seen.add(id); out.push({ id, name: String(row.name || `Branch ${id}`), isWarehouse: false }); }
  for (const row of Array.isArray(inventoryReport?.warehouseValue) ? inventoryReport.warehouseValue : []) { const id = String(row.branch_id || ""); if (!id || seen.has(id)) continue; seen.add(id); out.push({ id, name: String(row.branch_name || `Warehouse ${id}`), isWarehouse: true }); }
  return out;
}

async function snapshot(branch: Branch, rs: string, re: string, ps: string, pe: string): Promise<Snapshot> {
  const inventoryPromise = operationsRequest<Row[]>(`inventory?branch_id=${encodeURIComponent(branch.id)}&active=1&is_service=0&is_rental=0&is_non_inventory=0`);
  if (branch.isWarehouse) return { branch, inventory: await inventoryPromise, recent: new Map(), prior: new Map() };
  const [inventory, recent, prior] = await Promise.all([
    inventoryPromise,
    operationsRequest<Row[]>(`reports/top-products?start=${rs}&end=${re}&branch_id=${encodeURIComponent(branch.id)}&limit=5000`),
    operationsRequest<Row[]>(`reports/top-products?start=${ps}&end=${pe}&branch_id=${encodeURIComponent(branch.id)}&limit=5000`),
  ]);
  return { branch, inventory, recent: movement(recent), prior: movement(prior) };
}

async function loadInbound(): Promise<InboundMap> {
  const map: InboundMap = new Map();
  const [transfers, pos] = await Promise.allSettled([operationsRequest<Row[]>("transfers?limit=250"), operationsRequest<Row[]>("purchase-orders?limit=250")]);
  const add = (branchId: unknown, sku: unknown, qty: number) => { if (!branchId || !sku || qty <= 0) return; const k = key(branchId, sku); map.set(k, (map.get(k) || 0) + qty); };
  if (transfers.status === "fulfilled") {
    const rows = transfers.value.filter((row) => ["pending", "in_transit"].includes(String(row.status || ""))).slice(0, DETAIL_LIMIT);
    const details = await Promise.allSettled(rows.map((row) => operationsRequest<Row>(`transfers/${encodeURIComponent(String(row.id))}`)));
    for (const result of details) if (result.status === "fulfilled") for (const item of Array.isArray(result.value.items) ? result.value.items : []) add(result.value.to_branch_id, item.sku, Math.max(0, n(item.quantity_requested) - n(item.quantity_received)));
  }
  if (pos.status === "fulfilled") {
    const now = Date.now();
    const rows = pos.value.filter((row) => !["received", "cancelled", "closed"].includes(String(row.status || ""))).slice(0, DETAIL_LIMIT);
    const details = await Promise.allSettled(rows.map((row) => operationsRequest<Row>(`purchase-orders/${encodeURIComponent(String(row.id))}`)));
    for (const result of details) if (result.status === "fulfilled") {
      const po = result.value; const expected = new Date(String(po.expected_date || "")).getTime();
      if (!Number.isFinite(expected) || expected < now - 86400000) continue;
      for (const item of Array.isArray(po.items) ? po.items : []) add(po.branch_id, item.sku, Math.max(0, n(item.quantity_ordered) - n(item.quantity_received)));
    }
  }
  return map;
}

function decisions(snapshots: Snapshot[], inbound: InboundMap): Decision[] {
  const bySku = new Map<string, Array<{ snap: Snapshot; row: Row }>>();
  for (const snap of snapshots) for (const row of snap.inventory) { const sku = String(row.sku || "").trim(); if (!sku) continue; const list = bySku.get(sku) || []; list.push({ snap, row }); bySku.set(sku, list); }
  const out: Decision[] = [];
  for (const [sku, positions] of bySku) for (const destination of positions) {
    if (destination.snap.branch.isWarehouse) continue;
    const stock = Math.max(0, n(destination.row.stock_qty)); const minimum = Math.max(0, n(destination.row.min_stock));
    const recent = destination.snap.recent.get(sku) || 0, prior = destination.snap.prior.get(sku) || 0; const daily = forecast(recent, prior);
    const horizon = recent > prior * 1.25 ? 60 : recent < prior * 0.75 ? 35 : 45;
    const target = Math.max(minimum * 2, daily > 0 ? Math.ceil(daily * horizon) : minimum * 2, minimum + 1);
    const inboundQty = inbound.get(key(destination.snap.branch.id, sku)) || 0; const effective = stock + inboundQty;
    if (effective >= target) continue;
    const shortfall = Math.max(1, Math.ceil(target - effective));
    if (inboundQty > 0 && stock < target && effective >= Math.max(minimum + 1, Math.ceil(target * 0.8))) {
      out.push({ sku, name: String(destination.row.name || sku), branch: destination.snap.branch.name, action: "wait", quantity: shortfall, effective, target, forecastDaily: daily, inbound: inboundQty, rationale: `${inboundQty} credible inbound units cover most of the forward requirement. Avoid creating duplicate supply unless the expected receipt changes.` });
      continue;
    }
    const donor = positions.filter((p) => p.snap.branch.id !== destination.snap.branch.id).map((p) => {
      const donorStock = Math.max(0, n(p.row.stock_qty)); const donorMinimum = Math.max(0, n(p.row.min_stock));
      const dr = p.snap.branch.isWarehouse ? 0 : (p.snap.recent.get(sku) || 0), dp = p.snap.branch.isWarehouse ? 0 : (p.snap.prior.get(sku) || 0); const dd = forecast(dr, dp);
      const safety = Math.max(donorMinimum * 1.5, dd > 0 ? Math.ceil(dd * 45) : donorMinimum * 1.5, 1); const surplus = Math.max(0, Math.floor(donorStock - safety));
      return { p, surplus, dd, stagnant: p.snap.branch.isWarehouse || (dr === 0 && dp === 0) };
    }).filter((x) => x.surplus > 0 && (x.stagnant || x.dd <= daily * 0.5)).sort((a, b) => Number(b.stagnant) - Number(a.stagnant) || b.surplus - a.surplus)[0];
    if (donor) {
      const qty = Math.min(shortfall, donor.surplus);
      out.push({ sku, name: String(destination.row.name || sku), branch: destination.snap.branch.name, action: "transfer", quantity: qty, effective, target, forecastDaily: daily, donor: donor.p.snap.branch.name, inbound: inboundQty, rationale: `${donor.p.snap.branch.name} can release ${qty} units without falling below its own safety stock. Transfer before buying.` });
    } else {
      out.push({ sku, name: String(destination.row.name || sku), branch: destination.snap.branch.name, action: "buy", quantity: shortfall, effective, target, forecastDaily: daily, inbound: inboundQty, rationale: `No safe internal donor was found and credible inbound does not cover the forward target. Raise or consolidate purchasing for the remaining shortfall.` });
    }
  }
  const rank = { buy: 3, transfer: 2, wait: 1 };
  return out.sort((a, b) => rank[b.action] - rank[a.action] || b.forecastDaily - a.forecastDaily || b.quantity - a.quantity);
}

export default function ReplenishmentDecisionBoard() {
  const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [data, setData] = useState<Snapshot[]>([]); const [inbound, setInbound] = useState<InboundMap>(new Map());
  async function load() {
    setLoading(true); setError("");
    try {
      const locations = await branches(); const recentEnd = new Date(); const recentStart = new Date(recentEnd.getTime() - 29 * 86400000); const priorEnd = new Date(recentStart.getTime() - 86400000); const priorStart = new Date(priorEnd.getTime() - 29 * 86400000);
      const [snapshots, inboundMap] = await Promise.all([Promise.all(locations.slice(0, 20).map((b) => snapshot(b, iso(recentStart), iso(recentEnd), iso(priorStart), iso(priorEnd)))), loadInbound()]);
      setData(snapshots); setInbound(inboundMap);
    } catch (cause) { const e = cause as OperationsApiError; setError(e.status === 403 ? "Inventory, Reports, Transfers and Purchasing access are required for complete replenishment decisions." : e.message || "Replenishment intelligence could not be loaded."); setData([]); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const rows = useMemo(() => decisions(data, inbound), [data, inbound]);
  return <section className="sc-replenishment" data-guide-id="replenishment-decision-board">
    <div className="sc-replenishment__heading"><div><PackagePlus size={19}/><div><span>Replenishment Decision Engine</span><strong>Wait, transfer, or buy</strong><p>Resolves forward stock risk into one preferred action instead of showing disconnected inventory signals.</p></div></div><button type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/>{loading ? "Resolving…" : "Recalculate"}</button></div>
    <div className="sc-replenishment__metrics"><article><Clock3 size={17}/><span>Wait for inbound</span><strong>{loading ? "—" : rows.filter((r) => r.action === "wait").length}</strong></article><article><ArrowRightLeft size={17}/><span>Transfer first</span><strong>{loading ? "—" : rows.filter((r) => r.action === "transfer").length}</strong></article><article><ShoppingCart size={17}/><span>Purchase required</span><strong>{loading ? "—" : rows.filter((r) => r.action === "buy").length}</strong></article></div>
    {error ? <div className="sc-ops-empty is-error"><strong>Replenishment decisions unavailable</strong><p>{error}</p></div> : null}
    {!error && !loading && !rows.length ? <div className="sc-ops-empty"><strong>No replenishment actions required</strong><p>Current effective stock and credible inbound cover the analyzed forward demand targets.</p></div> : null}
    {rows.length ? <div className="sc-replenishment__list">{rows.slice(0, 100).map((row) => <article key={`${row.branch}-${row.sku}`} className={`is-${row.action}`}><div><em>{row.action === "wait" ? "WAIT" : row.action === "transfer" ? "TRANSFER" : "BUY"}</em><strong>{row.name}</strong><span>{row.sku} · {row.branch}</span></div><div><small>Effective / target</small><strong>{row.effective} / {row.target}</strong><span>{row.inbound} inbound</span></div><div><small>Recommended quantity</small><strong>{row.quantity}</strong><span>{row.donor ? `From ${row.donor}` : `${row.forecastDaily.toFixed(2)} forecast/day`}</span></div><p>{row.rationale}</p></article>)}</div> : null}
    <p className="sc-replenishment__footnote">Decisions remain advisory. “Wait” requires credible, non-overdue inbound evidence; “Transfer” protects donor safety stock; “Buy” is used only when internal supply and credible inbound do not cover the forward target.</p>
  </section>;
}
