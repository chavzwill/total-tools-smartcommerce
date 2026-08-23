import { Download, FileSpreadsheet, Printer, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { reportingRequest, type OperationsApiError, type StaffIdentity } from "../../lib/staffOperations";
import "../../styles/reporting-center.css";

type Row = Record<string, any>;
type ReportKey =
  | "sales" | "branchperformance" | "quotes" | "crm" | "promotions" | "loyalty" | "customers"
  | "araging" | "arcollections" | "inventory" | "nonmoving" | "slowmoving" | "damage" | "offledger"
  | "movements" | "services" | "transfers" | "purchasing" | "vendors" | "rentals" | "rentalexceptions"
  | "repairs" | "repairexceptions" | "drawers" | "returns" | "cyclecounts" | "commissions" | "layaway" | "ecommerce";

type ReportDefinition = { key: ReportKey; label: string; group: string; description: string };
const REPORTS: ReportDefinition[] = [
  { key: "sales", label: "Sales", group: "Commercial", description: "Completed sales, tender mix and daily performance." },
  { key: "branchperformance", label: "Branch performance", group: "Commercial", description: "Sales and transaction performance by operating location." },
  { key: "quotes", label: "Quotations", group: "Commercial", description: "Quote value, lifecycle, acceptance and conversion evidence." },
  { key: "crm", label: "CRM pipeline", group: "Commercial", description: "Opportunity pipeline, won business, conversion and overdue activity evidence." },
  { key: "promotions", label: "Promotions", group: "Commercial", description: "Promotion definitions, active periods and product/code coverage." },
  { key: "loyalty", label: "Discount & cash-back programs", group: "Commercial", description: "Customer participation in discount and cash-back card programs." },
  { key: "customers", label: "Customer portfolio", group: "Customers & Credit", description: "Safe management view of customer type, credit, tax and rental eligibility." },
  { key: "araging", label: "Accounts receivable aging", group: "Customers & Credit", description: "Outstanding credit balances aged current, 31–60, 61–90 and over 90 days." },
  { key: "arcollections", label: "AR collections", group: "Customers & Credit", description: "Credit-account collections by customer, date and payment method." },
  { key: "inventory", label: "Inventory", group: "Inventory", description: "Stock value, low stock and branch inventory position." },
  { key: "nonmoving", label: "Non-moving items", group: "Inventory", description: "Items with stock but no verified sales in the selected window." },
  { key: "slowmoving", label: "Slow-moving items", group: "Inventory", description: "Items with low recent movement relative to stock held." },
  { key: "damage", label: "Damaged / write-off", group: "Inventory", description: "Damage, disposal and write-off stock reductions from the movement ledger." },
  { key: "offledger", label: "Stock removed without sale", group: "Inventory", description: "Negative inventory adjustments outside the completed-sale stock path." },
  { key: "movements", label: "Inventory movements", group: "Inventory", description: "Manual adjustments and transfer movement evidence." },
  { key: "services", label: "Services & non-inventory", group: "Inventory", description: "Service and non-inventory catalogue records that affect commercial operations." },
  { key: "transfers", label: "Branch transfers", group: "Supply Chain", description: "Transfer lifecycle, quantities requested/received and discrepancies." },
  { key: "purchasing", label: "Purchasing & receiving", group: "Supply Chain", description: "Purchase requests, purchase orders and receiving status." },
  { key: "vendors", label: "Vendor / supplier items", group: "Supply Chain", description: "Supplier-linked stock, sales movement and aging-by-no-sale evidence." },
  { key: "rentals", label: "Rentals", group: "Rental", description: "Rental agreements, revenue evidence, status, balances and item activity." },
  { key: "rentalexceptions", label: "Rental exceptions", group: "Rental", description: "Overdue, awaiting-payment, paused, damaged and balance-due rental exposure." },
  { key: "repairs", label: "Repairs", group: "Service", description: "Work-order status, branch and service operations evidence." },
  { key: "repairexceptions", label: "Repair exceptions", group: "Service", description: "Overdue, awaiting-payment and operationally blocked repair work orders." },
  { key: "drawers", label: "Cash drawers", group: "Audit", description: "Drawer sessions, reconciliation and over/short evidence." },
  { key: "returns", label: "Returns / refunds / voids", group: "Audit", description: "Transaction reversals and exception activity recorded by the POS." },
  { key: "cyclecounts", label: "Cycle-count variances", group: "Audit", description: "Physical-count sessions and stock variance evidence." },
  { key: "commissions", label: "Commissions", group: "Workforce", description: "Commission records, source sales and approval/payment status." },
  { key: "layaway", label: "Layaway", group: "Commercial", description: "Layaway agreements and payment status." },
  { key: "ecommerce", label: "E-commerce sync health", group: "Integration", description: "WooCommerce synchronization runs, failures and record counts—without configuration secrets." },
];

const dateOnly = (value: Date) => value.toISOString().slice(0, 10);
const label = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
const text = (value: unknown) => value == null || value === "" ? "—" : String(value);
const escapeCsv = (value: unknown) => { const s = value == null ? "" : String(value); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const safeFile = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function download(filename: string, type: string, content: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function flatten(prefix: string, value: unknown, target: Row) {
  if (value == null || typeof value !== "object") { target[prefix] = value; return; }
  if (Array.isArray(value)) { target[prefix] = value.map((item) => typeof item === "object" ? JSON.stringify(item) : String(item)).join(" | "); return; }
  for (const [key, child] of Object.entries(value as Row)) flatten(prefix ? `${prefix}.${key}` : key, child, target);
}

function exportableRows(rows: Row[]) {
  return rows.map((row) => { const flat: Row = {}; flatten("", row, flat); return flat; });
}

function canExport(staff: StaffIdentity) {
  if (Object.prototype.hasOwnProperty.call(staff.permissions, "reports_export")) return staff.permissions.reports_export === true;
  return staff.permissions.reports === true;
}

function filterDateRows(rows: Row[], start: string, end: string) {
  const startMs = new Date(`${start}T00:00:00Z`).getTime();
  const endMs = new Date(`${end}T23:59:59Z`).getTime();
  return rows.filter((row) => {
    const raw = row.created_at || row.date || row.started_at || row.checkout_date || row.order_date;
    if (!raw) return true;
    const time = new Date(String(raw)).getTime();
    return !Number.isFinite(time) || (time >= startMs && time <= endMs);
  });
}

async function loadReport(key: ReportKey, start: string, end: string, branchId: string) {
  const branch = branchId ? `&branch_id=${encodeURIComponent(branchId)}` : "";

  if (key === "sales") {
    const data = await reportingRequest<any>(`reports/sales?start=${start}&end=${end}${branch}`);
    return { rows: Array.isArray(data?.byDay) ? data.byDay : [], summary: data?.summary || {}, secondary: Array.isArray(data?.byMethod) ? data.byMethod : [] };
  }
  if (key === "branchperformance") {
    const data = await reportingRequest<any>("reports/dashboard");
    return { rows: Array.isArray(data?.byLocation) ? data.byLocation : [], summary: { today_sales: data?.todayStats?.sales, month_sales: data?.monthStats?.sales, customers: data?.totalCustomers?.count, low_stock: data?.lowStock?.count } };
  }
  if (key === "quotes") return { rows: filterDateRows(await reportingRequest<Row[]>(`quotations?limit=500${branch}`), start, end), summary: {} };
  if (key === "crm") {
    const [dashboard, opportunities] = await Promise.all([reportingRequest<any>("crm/dashboard"), reportingRequest<Row[]>("crm/opportunities")]);
    return {
      rows: Array.isArray(opportunities) ? opportunities : [],
      summary: { pipeline_total: dashboard?.pipelineTotal?.total, won_this_month: dashboard?.wonThisMonth?.value, won_count: dashboard?.wonThisMonth?.count, conversion_rate_percent: dashboard?.conversionRate, overdue_activities: dashboard?.overdueActivities?.count },
      secondary: [ ...(Array.isArray(dashboard?.leadsByStatus) ? dashboard.leadsByStatus.map((row: Row) => ({ record_type: "Lead status", ...row })) : []), ...(Array.isArray(dashboard?.oppsByStage) ? dashboard.oppsByStage.map((row: Row) => ({ record_type: "Opportunity stage", ...row })) : []) ],
    };
  }
  if (key === "promotions") return { rows: await reportingRequest<Row[]>("promotions"), summary: {} };
  if (key === "loyalty") {
    const [discountCards, cashBackCards] = await Promise.all([reportingRequest<Row[]>("discount-cards"), reportingRequest<Row[]>("cash-back-cards")]);
    return { rows: [ ...(Array.isArray(discountCards) ? discountCards.map((row) => ({ program_type: "Discount card", ...row })) : []), ...(Array.isArray(cashBackCards) ? cashBackCards.map((row) => ({ program_type: "Cash-back card", ...row })) : []) ], summary: {} };
  }
  if (key === "customers") return { rows: await reportingRequest<Row[]>("customers?active=1"), summary: {} };
  if (key === "araging") {
    const [rows, stats] = await Promise.all([reportingRequest<Row[]>("accounts/aging"), reportingRequest<Row>("accounts/stats")]);
    return { rows: Array.isArray(rows) ? rows : [], summary: stats || {} };
  }
  if (key === "arcollections") {
    const data = await reportingRequest<any>(`reports/ar-collections?start=${start}&end=${end}${branch}`);
    return { rows: Array.isArray(data?.byCustomer) ? data.byCustomer : [], summary: data?.summary || {}, secondary: [ ...(Array.isArray(data?.byDay) ? data.byDay : []), ...(Array.isArray(data?.byMethod) ? data.byMethod : []) ] };
  }
  if (key === "inventory") {
    const data = await reportingRequest<any>(`reports/inventory?${branchId ? `branch_id=${encodeURIComponent(branchId)}` : ""}`);
    return { rows: Array.isArray(data?.lowStock) ? data.lowStock : [], summary: data?.summary || {}, secondary: Array.isArray(data?.byCategory) ? data.byCategory : [] };
  }
  if (["nonmoving", "slowmoving", "vendors"].includes(key)) {
    const [products, recent, suppliers] = await Promise.all([
      reportingRequest<Row[]>(`inventory?active=1&is_service=0&is_non_inventory=0${branchId ? `&branch_id=${encodeURIComponent(branchId)}` : ""}`),
      reportingRequest<Row[]>(`reports/top-products?start=${start}&end=${end}&limit=5000${branch}`),
      reportingRequest<Row[]>("suppliers"),
    ]);
    const sold = new Map((Array.isArray(recent) ? recent : []).map((row) => [String(row.sku || ""), Number(row.units_sold || 0)]));
    const supplierById = new Map((Array.isArray(suppliers) ? suppliers : []).map((row) => [String(row.id), row]));
    const days = Math.max(1, Math.ceil((new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86400000) + 1);
    const enriched = (Array.isArray(products) ? products : []).map((row) => {
      const unitsSold = sold.get(String(row.sku || "")) || 0;
      const stock = Number(row.stock_qty || 0);
      const dailyVelocity = unitsSold / days;
      return {
        sku: row.sku,
        product: row.name,
        supplier: supplierById.get(String(row.supplier_id || ""))?.name || "Unassigned",
        stock_qty: stock,
        min_stock: Number(row.min_stock || 0),
        cost: Number(row.cost || 0),
        price: Number(row.price || 0),
        units_sold: unitsSold,
        stock_value: stock * Number(row.cost || 0),
        daily_velocity: dailyVelocity,
        days_of_cover: dailyVelocity > 0 ? stock / dailyVelocity : null,
      };
    });
    if (key === "nonmoving") return { rows: enriched.filter((row) => row.stock_qty > 0 && row.units_sold === 0).sort((a, b) => b.stock_value - a.stock_value), summary: {} };
    if (key === "slowmoving") return { rows: enriched.filter((row) => row.stock_qty > 0 && row.units_sold > 0 && Number(row.days_of_cover || 0) >= 90).sort((a, b) => Number(b.days_of_cover || 0) - Number(a.days_of_cover || 0)), summary: {} };
    return { rows: enriched.sort((a, b) => String(a.supplier).localeCompare(String(b.supplier)) || b.stock_value - a.stock_value), summary: {} };
  }
  if (["damage", "offledger", "movements"].includes(key)) {
    const data = await reportingRequest<any>(`inventory/movements?limit=1000${branchId ? `&branch_id=${encodeURIComponent(branchId)}` : ""}`);
    const adjustments = filterDateRows(Array.isArray(data?.adjustments) ? data.adjustments : [], start, end);
    if (key === "damage") return { rows: adjustments.filter((row: Row) => Number(row.quantity_change) < 0 && /(damage|write.?off|disposal|scrap|broken)/i.test(String(row.reason || row.type || ""))), summary: {} };
    if (key === "offledger") return { rows: adjustments.filter((row: Row) => Number(row.quantity_change) < 0), summary: {} };
    const transfers = filterDateRows(Array.isArray(data?.transfers) ? data.transfers : [], start, end);
    return { rows: [...adjustments.map((row: Row) => ({ movement_kind: "Adjustment", ...row })), ...transfers.map((row: Row) => ({ movement_kind: "Transfer", ...row }))], summary: {} };
  }
  if (key === "services") {
    const [services, nonInventory] = await Promise.all([reportingRequest<Row[]>("inventory?active=1&is_service=1"), reportingRequest<Row[]>("inventory?active=1&is_non_inventory=1")]);
    return { rows: [ ...(Array.isArray(services) ? services.map((row) => ({ record_type: "Service", ...row })) : []), ...(Array.isArray(nonInventory) ? nonInventory.map((row) => ({ record_type: "Non-inventory", ...row })) : []) ], summary: {} };
  }
  if (key === "transfers") return { rows: filterDateRows(await reportingRequest<Row[]>("transfers?limit=500"), start, end), summary: {} };
  if (key === "purchasing") {
    const [prs, pos] = await Promise.all([reportingRequest<Row[]>("purchase-requests?limit=500"), reportingRequest<Row[]>("purchase-orders?limit=500")]);
    return { rows: filterDateRows([ ...(Array.isArray(prs) ? prs.map((row) => ({ record_type: "Purchase Request", ...row })) : []), ...(Array.isArray(pos) ? pos.map((row) => ({ record_type: "Purchase Order", ...row })) : []) ], start, end), summary: {} };
  }
  if (key === "rentals" || key === "rentalexceptions") {
    const rows = filterDateRows(await reportingRequest<Row[]>(`rentals/agreements?${branchId ? `branch_id=${encodeURIComponent(branchId)}` : ""}`), start, end);
    if (key === "rentals") return { rows, summary: {} };
    return { rows: rows.filter((row) => ["overdue", "paused", "awaiting_payment"].includes(String(row.display_status || row.status || "")) || Number(row.balance_due || 0) > 0 || Number(row.damage_fee_total || 0) > 0), summary: {} };
  }
  if (key === "repairs" || key === "repairexceptions") {
    const rows = filterDateRows(await reportingRequest<Row[]>(`work-orders?limit=500${branch}`), start, end);
    if (key === "repairs") return { rows, summary: {} };
    return { rows: rows.filter((row) => Number(row.days_past_pickup_due || 0) > 0 || /awaiting|blocked|overdue/i.test(String(row.status || ""))), summary: {} };
  }
  if (key === "drawers") return { rows: filterDateRows(await reportingRequest<Row[]>(`drawers/sessions?limit=500${branch}`), start, end), summary: {} };
  if (key === "returns") {
    const rows = filterDateRows(await reportingRequest<Row[]>(`transactions?limit=500${branch}`), start, end);
    return { rows: rows.filter((row) => String(row.status || "").toLowerCase() !== "completed" || Number(row.refund_amount || 0) > 0 || Number(row.return_total || 0) > 0 || row.voided_at), summary: {} };
  }
  if (key === "cyclecounts") return { rows: filterDateRows(await reportingRequest<Row[]>(`warehouse/cycle-counts?limit=500${branch}`), start, end), summary: {} };
  if (key === "commissions") return { rows: filterDateRows(await reportingRequest<Row[]>("commissions/records"), start, end), summary: {} };
  if (key === "layaway") return { rows: filterDateRows(await reportingRequest<Row[]>(`layaway?${branchId ? `branch_id=${encodeURIComponent(branchId)}` : ""}`), start, end), summary: {} };
  if (key === "ecommerce") return { rows: await reportingRequest<Row[]>("woocommerce/logs"), summary: {} };
  return { rows: [], summary: {} };
}

function visibleColumns(rows: Row[]) {
  const priority = [
    "record_type", "program_type", "date", "created_at", "started_at", "transaction_number", "agreement_number", "work_order_number", "quote_number", "po_number", "pr_number", "transfer_number",
    "customer_number", "customer_name", "sku", "product", "product_name", "name", "supplier", "supplier_name", "branch_name", "from_branch_name", "to_branch_name", "status", "display_status",
    "account_balance", "current_30", "days_31_60", "days_61_90", "over_90", "quantity_change", "stock_qty", "units_sold", "days_of_cover", "total", "sales", "balance_due", "reason",
  ];
  const keys = new Set<string>();
  rows.slice(0, 50).forEach((row) => Object.keys(row).forEach((key) => { if (typeof row[key] !== "object") keys.add(key); }));
  return [...priority.filter((key) => keys.has(key)), ...[...keys].filter((key) => !priority.includes(key)).sort()].slice(0, 14);
}

export default function ReportingCenter({ staff }: { staff: StaffIdentity }) {
  const today = new Date();
  const startDefault = new Date(today.getTime() - 29 * 86400000);
  const [report, setReport] = useState<ReportKey>("sales");
  const [start, setStart] = useState(dateOnly(startDefault));
  const [end, setEnd] = useState(dateOnly(today));
  const [branchId, setBranchId] = useState("");
  const [branches, setBranches] = useState<Row[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [secondary, setSecondary] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Row>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const definition = REPORTS.find((item) => item.key === report)!;

  async function load() {
    setLoading(true); setError("");
    try {
      const result = await loadReport(report, start, end, branchId);
      setRows(Array.isArray(result.rows) ? result.rows : []);
      setSummary(result.summary || {});
      setSecondary(Array.isArray(result.secondary) ? result.secondary : []);
    } catch (e) {
      setRows([]); setSummary({}); setSecondary([]);
      setError((e as OperationsApiError).message || "This report could not be loaded.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void reportingRequest<Row[]>("branches").then((value) => setBranches(Array.isArray(value) ? value : [])).catch(() => setBranches([])); }, []);
  useEffect(() => { void load(); }, [report]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => Object.values(row).some((value) => typeof value !== "object" && String(value ?? "").toLowerCase().includes(needle)));
  }, [rows, query]);
  const columns = useMemo(() => visibleColumns(filtered), [filtered]);
  const summaryEntries = useMemo(() => Object.entries(summary).filter(([, value]) => value != null && typeof value !== "object").slice(0, 8), [summary]);

  function csvExport() {
    const flat = exportableRows(filtered);
    const headers = [...new Set(flat.flatMap(Object.keys))];
    const csv = [headers.map(escapeCsv).join(","), ...flat.map((row) => headers.map((key) => escapeCsv(row[key])).join(","))].join("\r\n");
    download(`${safeFile(definition.label)}-${start}-to-${end}.csv`, "text/csv;charset=utf-8", csv);
  }

  function excelExport() {
    const flat = exportableRows(filtered);
    const headers = [...new Set(flat.flatMap(Object.keys))];
    const esc = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
    const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><table><thead><tr>${headers.map((h) => `<th>${esc(label(h))}</th>`).join("")}</tr></thead><tbody>${flat.map((row) => `<tr>${headers.map((h) => `<td>${esc(row[h])}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
    download(`${safeFile(definition.label)}-${start}-to-${end}.xls`, "application/vnd.ms-excel;charset=utf-8", html);
  }

  return <section className="sc-reporting-center" data-guide-id="reporting-center">
    <aside className="sc-reporting-center__nav">
      <div><strong>Reporting Center</strong><span>If the POS records it, it should be reportable.</span></div>
      {[...new Set(REPORTS.map((item) => item.group))].map((group) => <section key={group}><h3>{group}</h3>{REPORTS.filter((item) => item.group === group).map((item) => <button key={item.key} type="button" className={report === item.key ? "is-active" : ""} onClick={() => { setReport(item.key); setQuery(""); }}>{item.label}</button>)}</section>)}
    </aside>
    <div className="sc-reporting-center__main">
      <div className="sc-reporting-center__print-heading"><strong>Total Tools Rental & Electrical Supplies Limited</strong><span>{definition.label} · {start} to {end}</span></div>
      <header className="sc-reporting-center__header">
        <div><span>{definition.group}</span><h2>{definition.label}</h2><p>{definition.description}</p></div>
        <div className="sc-reporting-center__actions">
          <button type="button" onClick={csvExport} disabled={!canExport(staff) || !filtered.length}><Download size={15}/>CSV</button>
          <button type="button" onClick={excelExport} disabled={!canExport(staff) || !filtered.length}><FileSpreadsheet size={15}/>Excel</button>
          <button type="button" onClick={() => window.print()} disabled={!filtered.length}><Printer size={15}/>Print / PDF</button>
        </div>
      </header>
      <div className="sc-reporting-center__filters">
        <label>From<input type="date" value={start} onChange={(event) => setStart(event.target.value)} /></label>
        <label>To<input type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></label>
        <label>Branch<select value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">All locations</option>{branches.map((branch) => <option key={String(branch.id)} value={String(branch.id)}>{branch.name || branch.branch_name || branch.id}</option>)}</select></label>
        <button type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/>{loading ? "Loading…" : "Run report"}</button>
        <label className="sc-reporting-center__search">Search<Search size={14}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter this report" /></label>
      </div>
      {summaryEntries.length ? <div className="sc-reporting-center__summary">{summaryEntries.map(([key, value]) => <article key={key}><span>{label(key)}</span><strong>{text(value)}</strong></article>)}</div> : null}
      {error ? <div className="sc-reporting-center__empty is-error"><div><strong>Report unavailable</strong><p>{error}</p></div></div> : loading ? <div className="sc-reporting-center__empty"><div><strong>Loading report…</strong><p>Reading live POS evidence.</p></div></div> : !filtered.length ? <div className="sc-reporting-center__empty"><div><strong>No matching records</strong><p>No POS evidence matched the selected report and filters.</p></div></div> : <div className="sc-reporting-center__table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{label(column)}</th>)}</tr></thead><tbody>{filtered.map((row, index) => <tr key={String(row.id ?? row.transaction_number ?? row.agreement_number ?? row.work_order_number ?? index)}>{columns.map((column) => <td key={column}>{text(row[column])}</td>)}</tr>)}</tbody></table></div>}
      {secondary.length ? <details className="sc-reporting-center__secondary"><summary>Supporting breakdown ({secondary.length})</summary><pre>{JSON.stringify(secondary, null, 2)}</pre></details> : null}
      <footer className="sc-reporting-center__footer"><span>{filtered.length} displayed record{filtered.length === 1 ? "" : "s"}</span><span>Generated {new Date().toLocaleString("en-JM")}</span></footer>
    </div>
  </section>;
}
