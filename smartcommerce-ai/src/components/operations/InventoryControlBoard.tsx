import { AlertTriangle, Boxes, PackageSearch, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import "../../styles/inventory-control.css";

type Product = Record<string, any>;

export default function InventoryControlBoard({ rows, onRefresh }: { rows: Product[]; onRefresh?: () => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "low" | "out">("all");
  const normalized = query.trim().toLowerCase();
  const filtered = useMemo(() => rows.filter((row) => {
    const stock = Number(row.stock_qty ?? row.stock ?? 0);
    const minimum = Number(row.min_stock ?? row.reorder_level ?? 0);
    const matches = !normalized || [row.name, row.sku, row.brand, row.category].some((value) => String(value || "").toLowerCase().includes(normalized));
    if (!matches) return false;
    if (filter === "out") return stock <= 0;
    if (filter === "low") return stock > 0 && minimum > 0 && stock <= minimum;
    return true;
  }), [rows, normalized, filter]);
  const out = rows.filter((row) => Number(row.stock_qty ?? row.stock ?? 0) <= 0).length;
  const low = rows.filter((row) => { const stock = Number(row.stock_qty ?? row.stock ?? 0); const min = Number(row.min_stock ?? row.reorder_level ?? 0); return stock > 0 && min > 0 && stock <= min; }).length;
  const units = rows.reduce((sum, row) => sum + Math.max(0, Number(row.stock_qty ?? row.stock ?? 0)), 0);

  return <section className="sc-inventory-control" data-guide-id="inventory-control-board">
    <div className="sc-inventory-control__metrics">
      <article><Boxes size={18}/><span>Products</span><strong>{rows.length}</strong><small>Live POS catalogue</small></article>
      <article className={low ? "is-warning" : ""}><AlertTriangle size={18}/><span>Low stock</span><strong>{low}</strong><small>At or below minimum</small></article>
      <article className={out ? "is-danger" : ""}><PackageSearch size={18}/><span>Out of stock</span><strong>{out}</strong><small>Requires attention</small></article>
      <article><Boxes size={18}/><span>Units on hand</span><strong>{Math.round(units).toLocaleString()}</strong><small>Across returned products</small></article>
    </div>
    <div className="sc-inventory-control__toolbar">
      <label><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search product, SKU, brand or category" data-guide-id="inventory-search"/></label>
      <div>{(["all","low","out"] as const).map((key) => <button key={key} className={filter===key?"is-active":""} onClick={() => setFilter(key)}>{key === "all" ? "All stock" : key === "low" ? "Low stock" : "Out of stock"}</button>)}</div>
      {onRefresh ? <button className="sc-inventory-control__refresh" onClick={onRefresh}><RefreshCw size={15}/>Refresh</button> : null}
    </div>
    {filtered.length ? <div className="sc-inventory-control__table"><div className="sc-inventory-control__head"><span>Product</span><span>SKU</span><span>On hand</span><span>Minimum</span><span>State</span></div>{filtered.slice(0,250).map((row, index) => { const stock=Number(row.stock_qty ?? row.stock ?? 0); const min=Number(row.min_stock ?? row.reorder_level ?? 0); const state=stock<=0?"Out":min>0&&stock<=min?"Low":"Healthy"; return <article key={String(row.id ?? row.sku ?? index)}><div><strong>{row.name || "Unnamed product"}</strong><small>{row.brand || row.category || "Inventory item"}</small></div><span>{row.sku || "—"}</span><strong>{stock.toLocaleString()}</strong><span>{min || "—"}</span><em className={`is-${state.toLowerCase()}`}>{state}</em></article>; })}</div> : <div className="sc-ops-empty"><PackageSearch size={20}/><strong>No inventory matches</strong><p>No live POS products match this search/filter.</p></div>}
  </section>;
}
