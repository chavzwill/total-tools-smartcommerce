import { AlertTriangle, BadgeDollarSign, Boxes, RefreshCw, ShieldCheck, TrendingDown, TrendingUp, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { reportingRequest, type OperationsApiError } from "../../lib/staffOperations";
import "../../styles/management-economics-intelligence.css";

type Row = Record<string, any>;
type Dataset = { rows: Row[]; available: boolean; reason?: string };

type ProductEconomics = {
  sku: string;
  name: string;
  stock: number;
  cost: number;
  price: number;
  unitsSold: number;
  stockValue: number;
  grossMarginUnit: number | null;
  contributionProxy: number | null;
  dailyVelocity: number;
  daysCover: number | null;
  stockoutRiskProxy: number | null;
};

const DAYS = 30;
const money = (value: unknown) => new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", maximumFractionDigits: 0 }).format(Number(value || 0));
const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const rows = (value: any): Row[] => Array.isArray(value) ? value : Array.isArray(value?.rows) ? value.rows : Array.isArray(value?.data) ? value.data : Array.isArray(value?.items) ? value.items : [];
const dateOnly = (date: Date) => date.toISOString().slice(0, 10);

async function safe<T = any>(path: string): Promise<{ value?: T; available: boolean; reason?: string }> {
  try { return { value: await reportingRequest<T>(path), available: true }; }
  catch (cause) { const error = cause as OperationsApiError; return { available: false, reason: error.status === 403 ? "Restricted by staff permissions" : error.message || "Unavailable" }; }
}

export default function ManagementEconomicsIntelligence() {
  const [loading, setLoading] = useState(true);
  const [inventory, setInventory] = useState<Dataset>({ rows: [], available: false });
  const [sales, setSales] = useState<Dataset>({ rows: [], available: false });
  const [rentals, setRentals] = useState<Dataset>({ rows: [], available: false });
  const [repairs, setRepairs] = useState<Dataset>({ rows: [], available: false });
  const [promotions, setPromotions] = useState<Dataset>({ rows: [], available: false });

  async function load() {
    setLoading(true);
    const end = new Date();
    const start = new Date(end.getTime() - (DAYS - 1) * 86400000);
    const [inventoryResult, salesResult, rentalResult, repairResult, promotionResult] = await Promise.all([
      safe<any>("inventory?active=1&is_service=0&is_non_inventory=0"),
      safe<any>(`reports/top-products?start=${dateOnly(start)}&end=${dateOnly(end)}&limit=5000`),
      safe<any>("rentals?limit=500"),
      safe<any>("work-orders?limit=500"),
      safe<any>("promotions"),
    ]);
    setInventory({ rows: rows(inventoryResult.value), available: inventoryResult.available, reason: inventoryResult.reason });
    setSales({ rows: rows(salesResult.value), available: salesResult.available, reason: salesResult.reason });
    setRentals({ rows: rows(rentalResult.value), available: rentalResult.available, reason: rentalResult.reason });
    setRepairs({ rows: rows(repairResult.value), available: repairResult.available, reason: repairResult.reason });
    setPromotions({ rows: rows(promotionResult.value), available: promotionResult.available, reason: promotionResult.reason });
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const economics = useMemo(() => {
    const soldBySku = new Map<string, number>();
    for (const row of sales.rows) soldBySku.set(String(row.sku || ""), n(row.units_sold ?? row.quantity ?? row.qty));

    const products: ProductEconomics[] = inventory.rows.map((row) => {
      const sku = String(row.sku || "");
      const stock = Math.max(0, n(row.stock_qty ?? row.stock));
      const cost = Math.max(0, n(row.cost));
      const price = Math.max(0, n(row.price));
      const unitsSold = Math.max(0, soldBySku.get(sku) || 0);
      const grossMarginUnit = price > 0 && cost >= 0 ? price - cost : null;
      const contributionProxy = grossMarginUnit == null ? null : unitsSold * grossMarginUnit;
      const dailyVelocity = unitsSold / DAYS;
      const daysCover = dailyVelocity > 0 ? stock / dailyVelocity : null;
      const stockoutRiskProxy = stock <= 0 && dailyVelocity > 0 && grossMarginUnit != null ? dailyVelocity * grossMarginUnit * 7 : null;
      return { sku, name: String(row.name || sku || "Unnamed product"), stock, cost, price, unitsSold, stockValue: stock * cost, grossMarginUnit, contributionProxy, dailyVelocity, daysCover, stockoutRiskProxy };
    });

    const capitalHeld = products.reduce((sum, row) => sum + row.stockValue, 0);
    const nonMovingCapital = products.filter((row) => row.stock > 0 && row.unitsSold === 0).reduce((sum, row) => sum + row.stockValue, 0);
    const slowCapital = products.filter((row) => row.stock > 0 && row.unitsSold > 0 && Number(row.daysCover || 0) >= 90).reduce((sum, row) => sum + row.stockValue, 0);
    const contributionProxy = products.reduce((sum, row) => sum + Math.max(0, Number(row.contributionProxy || 0)), 0);
    const stockoutOpportunityProxy = products.reduce((sum, row) => sum + Math.max(0, Number(row.stockoutRiskProxy || 0)), 0);

    const dead = [...products].filter((row) => row.stock > 0 && row.unitsSold === 0).sort((a, b) => b.stockValue - a.stockValue).slice(0, 8);
    const winners = [...products].filter((row) => row.contributionProxy != null && row.unitsSold > 0).sort((a, b) => Number(b.contributionProxy) - Number(a.contributionProxy)).slice(0, 8);
    const stockouts = [...products].filter((row) => row.stockoutRiskProxy != null).sort((a, b) => Number(b.stockoutRiskProxy) - Number(a.stockoutRiskProxy)).slice(0, 8);

    const rentalRevenue = rentals.rows.reduce((sum, row) => sum + Math.max(0, n(row.total ?? row.total_amount ?? row.rental_total ?? row.grand_total)), 0);
    const rentalBalance = rentals.rows.reduce((sum, row) => sum + Math.max(0, n(row.balance_due)), 0);
    const rentalDamage = rentals.rows.reduce((sum, row) => sum + Math.max(0, n(row.damage_fees ?? row.damage_fee)), 0);
    const overdueRentals = rentals.rows.filter((row) => String(row.status || "").toLowerCase().includes("overdue") || n(row.days_overdue) > 0).length;

    const repairValue = repairs.rows.reduce((sum, row) => sum + Math.max(0, n(row.total ?? row.total_amount ?? row.estimated_total ?? row.quote_total)), 0);
    const completedRepairs = repairs.rows.filter((row) => ["completed", "ready_for_pickup", "collected", "closed"].includes(String(row.status || "").toLowerCase())).length;
    const overdueRepairs = repairs.rows.filter((row) => n(row.days_past_pickup_due) > 0).length;

    const activePromotions = promotions.rows.filter((row) => {
      const status = String(row.status || "").toLowerCase();
      return row.active === true || row.is_active === true || status === "active";
    }).length;

    const actions: Array<{ severity: "high" | "medium" | "good"; title: string; detail: string }> = [];
    if (nonMovingCapital > 0) actions.push({ severity: "high", title: `${money(nonMovingCapital)} tied up in non-moving stock`, detail: "Review markdown, transfer, bundle, supplier-return or purchasing-stop options before adding more of the same inventory." });
    if (stockoutOpportunityProxy > 0) actions.push({ severity: "high", title: `${money(stockoutOpportunityProxy)} 7-day catalog-margin opportunity proxy at stockout`, detail: "This is not booked lost profit. It flags previously selling SKUs that are currently out of stock and deserve transfer/replenishment review." });
    if (slowCapital > 0) actions.push({ severity: "medium", title: `${money(slowCapital)} held in 90+ day cover stock`, detail: "Compare branch demand and supplier lead time before reordering; consider transfer-to-demand before purchasing more." });
    if (rentalBalance > 0) actions.push({ severity: "medium", title: `${money(rentalBalance)} in recorded rental balances`, detail: "Review overdue/awaiting-payment agreements and deposit/damage exposure before issuing additional equipment to high-risk accounts." });
    if (overdueRepairs > 0) actions.push({ severity: "medium", title: `${overdueRepairs} repair jobs are beyond pickup due`, detail: "Check parts, authorization and technician constraints; repair revenue alone is not profitability without complete labor/parts cost evidence." });
    if (!actions.length && (inventory.available || rentals.available || repairs.available)) actions.push({ severity: "good", title: "No major economic exceptions detected from available evidence", detail: "Continue monitoring capital tied in stock, stockout exposure, rental balances and repair throughput." });

    return { products, capitalHeld, nonMovingCapital, slowCapital, contributionProxy, stockoutOpportunityProxy, dead, winners, stockouts, rentalRevenue, rentalBalance, rentalDamage, overdueRentals, repairValue, completedRepairs, overdueRepairs, activePromotions, actions };
  }, [inventory, sales, rentals, repairs, promotions]);

  const coverage = [
    ["Product economics", inventory.available && sales.available, inventory.reason || sales.reason, "proxy"],
    ["Rental economics", rentals.available, rentals.reason, "verified"],
    ["Repair economics", repairs.available, repairs.reason, "partial"],
    ["Promotion ROI", false, "Requires transaction-level promotion/discount attribution and realized margin evidence.", "unavailable"],
    ["Full net profitability", false, "Requires landed cost, freight/duties, allocated overhead and complete discount attribution.", "unavailable"],
  ] as const;

  return <section className="sc-management-economics" data-guide-id="management-economics-intelligence">
    <div className="sc-management-economics__heading"><div><BadgeDollarSign size={20}/><div><span>Management Economics</span><strong>Turn operating evidence into economic decisions</strong><p>Uses catalog cost, stock and verified movement to expose contribution proxies and capital risk. Proxy metrics are deliberately not presented as accounting profit.</p></div></div><button type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/>{loading ? "Recalculating…" : "Recalculate"}</button></div>

    <div className="sc-management-economics__metrics">
      <article><Boxes size={17}/><span>Inventory capital</span><strong>{inventory.available ? money(economics.capitalHeld) : "—"}</strong><small>Current stock × recorded cost</small></article>
      <article className={economics.nonMovingCapital > 0 ? "is-warning" : ""}><TrendingDown size={17}/><span>Non-moving capital</span><strong>{inventory.available && sales.available ? money(economics.nonMovingCapital) : "—"}</strong><small>No verified units sold in last {DAYS} days</small></article>
      <article><TrendingUp size={17}/><span>Catalog contribution proxy</span><strong>{inventory.available && sales.available ? money(economics.contributionProxy) : "—"}</strong><small>Units sold × (catalog price − recorded cost)</small></article>
      <article className={economics.stockoutOpportunityProxy > 0 ? "is-danger" : ""}><AlertTriangle size={17}/><span>Stockout opportunity proxy</span><strong>{inventory.available && sales.available ? money(economics.stockoutOpportunityProxy) : "—"}</strong><small>7-day margin proxy, not booked lost profit</small></article>
    </div>

    <div className="sc-management-economics__grid">
      <section><header><strong>Management actions</strong><span>Highest-value evidence-backed reviews</span></header><div className="sc-management-economics__actions">{economics.actions.map((item, index) => <article key={`${item.title}-${index}`} className={`is-${item.severity}`}><i/><div><strong>{item.title}</strong><p>{item.detail}</p></div></article>)}</div></section>
      <section><header><strong>Evidence confidence</strong><span>What management can and cannot conclude</span></header><div className="sc-management-economics__coverage">{coverage.map(([name, available, reason, grade]) => <div key={name}><span>{name}</span><strong data-grade={available ? grade : "unavailable"}>{available ? grade : "unavailable"}</strong><small>{available ? grade === "verified" ? "Direct operational evidence" : "Useful decision signal; not full accounting profit" : reason}</small></div>)}</div></section>
    </div>

    <div className="sc-management-economics__tables">
      <section><header><strong>Highest catalog contribution proxies</strong><span>Last {DAYS} days</span></header>{economics.winners.length ? <table><thead><tr><th>SKU</th><th>Product</th><th>Units</th><th>Unit margin proxy</th><th>Contribution proxy</th></tr></thead><tbody>{economics.winners.map((row) => <tr key={row.sku}><td>{row.sku || "—"}</td><td>{row.name}</td><td>{row.unitsSold}</td><td>{row.grossMarginUnit == null ? "—" : money(row.grossMarginUnit)}</td><td>{row.contributionProxy == null ? "—" : money(row.contributionProxy)}</td></tr>)}</tbody></table> : <p>No usable product contribution evidence.</p>}</section>
      <section><header><strong>Capital trapped in non-moving stock</strong><span>Priority review</span></header>{economics.dead.length ? <table><thead><tr><th>SKU</th><th>Product</th><th>Stock</th><th>Capital</th></tr></thead><tbody>{economics.dead.map((row) => <tr key={row.sku}><td>{row.sku || "—"}</td><td>{row.name}</td><td>{row.stock}</td><td>{money(row.stockValue)}</td></tr>)}</tbody></table> : <p>No non-moving stocked items in available evidence.</p>}</section>
    </div>

    <div className="sc-management-economics__domain">
      <article><BadgeDollarSign size={17}/><span>Rental recorded value</span><strong>{rentals.available ? money(economics.rentalRevenue) : "—"}</strong><small>{rentals.available ? `${economics.overdueRentals} overdue · ${money(economics.rentalBalance)} balance due · ${money(economics.rentalDamage)} damage fees` : rentals.reason || "Unavailable"}</small></article>
      <article><Wrench size={17}/><span>Repair recorded value</span><strong>{repairs.available ? money(economics.repairValue) : "—"}</strong><small>{repairs.available ? `${economics.completedRepairs} completed-state records · ${economics.overdueRepairs} overdue` : repairs.reason || "Unavailable"}</small></article>
      <article><ShieldCheck size={17}/><span>Promotion effectiveness</span><strong>{promotions.available ? `${economics.activePromotions} active` : "—"}</strong><small>ROI remains unavailable until sales carry authoritative promotion attribution.</small></article>
    </div>

    <footer><strong>Economic integrity:</strong> catalog contribution is a management proxy, not net profit. Freight, duties, landed-cost allocation, realized transaction discounts, payroll allocation and overhead must be included before accounting profitability can be claimed.</footer>
  </section>;
}
