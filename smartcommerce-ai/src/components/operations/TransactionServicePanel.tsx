import { Ban, Printer, RefreshCw, RotateCcw, Search, ShieldCheck, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { operationsRequest, type OperationsApiError, type StaffIdentity } from "../../lib/staffOperations";
import "../../styles/transaction-service-panel.css";

type Row = Record<string, any>;
type Transaction = Row & { id: string | number; transaction_number?: string; status?: string; total?: number; subtotal?: number; tax_amount?: number; discount_amount?: number; payment_method?: string; created_at?: string; customer_name?: string; employee_name?: string; branch_name?: string; items?: Row[]; payments?: Row[]; rental_agreement_id?: string | number };

const n = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0;
const money = (v: number) => new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", maximumFractionDigits: 2 }).format(v || 0);
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[ch] || ch));

function permitted(staff: StaffIdentity, key: string, parent: string) {
  if (Object.prototype.hasOwnProperty.call(staff.permissions, key)) return staff.permissions[key] === true;
  return staff.permissions[parent] === true;
}

export default function TransactionServicePanel({ staff }: { staff: StaffIdentity }) {
  const branchId = String(staff.defaultBranchId || "");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Transaction[]>([]);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [returns, setReturns] = useState<Row[]>([]);
  const [returnQty, setReturnQty] = useState<Record<string, string>>({});
  const [resolution, setResolution] = useState("refund");
  const [returnNotes, setReturnNotes] = useState("");
  const [returnOpen, setReturnOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidPin, setVoidPin] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const canReturn = permitted(staff, "transactions_returns", "transactions");
  const returnedByItem = useMemo(() => {
    const map = new Map<string, number>();
    for (const ret of returns) if (String(ret.status || "") !== "cancelled") for (const item of Array.isArray(ret.items) ? ret.items : []) {
      const key = String(item.transaction_item_id || ""); if (key) map.set(key, (map.get(key) || 0) + n(item.quantity));
    }
    return map;
  }, [returns]);

  async function loadRecent(search = query) {
    setBusy(true); setError("");
    try {
      const suffix = search.trim() ? `&transaction_number=${encodeURIComponent(search.trim())}` : "";
      const result = await operationsRequest<Transaction[]>(`transactions?limit=20${branchId ? `&branch_id=${encodeURIComponent(branchId)}` : ""}${suffix}`);
      setRows((Array.isArray(result) ? result : []).filter((r) => String(r.status || "") !== "hold"));
    } catch (cause) { setError((cause as OperationsApiError).message || "Transactions could not be loaded."); }
    finally { setBusy(false); }
  }
  useEffect(() => { void loadRecent(""); }, [branchId]);

  async function openTransaction(row: Transaction) {
    setBusy(true); setError(""); setMessage("");
    try {
      const [detail, returnRows] = await Promise.all([
        operationsRequest<Transaction>(`transactions/${encodeURIComponent(String(row.id))}`),
        operationsRequest<Row[]>(`transactions/${encodeURIComponent(String(row.id))}/returns`).catch(() => []),
      ]);
      setSelected(detail); setReturns(Array.isArray(returnRows) ? returnRows : []); setReturnQty({});
    } catch (cause) { setError((cause as OperationsApiError).message || "Transaction details could not be loaded."); }
    finally { setBusy(false); }
  }

  function printReceipt() {
    if (!selected) return;
    const lines = (selected.items || []).map((item) => `<tr><td>${esc(item.product_name)}</td><td>${esc(item.sku)}</td><td>${n(item.quantity)}</td><td>${money(n(item.unit_price))}</td><td>${money(n(item.total) + n(item.tax_amount))}</td></tr>`).join("");
    const payments = (selected.payments || []).map((p) => `<div>${esc(String(p.payment_method || "").replace(/_/g, " "))}: <strong>${money(n(p.amount))}</strong>${p.approval_code ? ` · Ref ${esc(p.approval_code)}` : ""}</div>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(selected.transaction_number || "Receipt")}</title><style>body{font-family:Arial,sans-serif;color:#111;padding:28px;max-width:720px;margin:auto}h1{font-size:22px;margin:0}h2{font-size:15px;margin:6px 0 20px}small{color:#555}.meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 20px;margin:18px 0}table{width:100%;border-collapse:collapse;margin:18px 0}th,td{text-align:left;padding:8px;border-bottom:1px solid #ddd;font-size:12px}th{background:#f5f5f5}.totals{margin-left:auto;width:260px}.totals div{display:flex;justify-content:space-between;padding:4px}.total{font-size:18px;font-weight:700;border-top:2px solid #111;margin-top:5px;padding-top:8px!important}.payments{margin-top:16px;font-size:12px}@media print{body{padding:0}}</style></head><body><h1>Total Tools Jamaica</h1><h2>Sales Receipt · ${esc(selected.transaction_number)}</h2><div class="meta"><div><small>Branch</small><br>${esc(selected.branch_name)}</div><div><small>Date</small><br>${esc(selected.created_at ? new Date(selected.created_at).toLocaleString() : "")}</div><div><small>Customer</small><br>${esc(selected.customer_name || "Walk-in customer")}</div><div><small>Cashier</small><br>${esc(selected.employee_name || "")}</div></div><table><thead><tr><th>Item</th><th>SKU</th><th>Qty</th><th>Price</th><th>Line</th></tr></thead><tbody>${lines}</tbody></table><div class="totals"><div><span>Subtotal</span><span>${money(n(selected.subtotal))}</span></div><div><span>Tax</span><span>${money(n(selected.tax_amount))}</span></div><div><span>Discount</span><span>-${money(n(selected.discount_amount))}</span></div><div class="total"><span>Total</span><span>${money(n(selected.total))}</span></div></div><div class="payments">${payments}</div><p><small>Thank you for shopping with Total Tools Jamaica.</small></p></body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank", "width=760,height=900");
    if (!win) { URL.revokeObjectURL(url); return setError("Pop-up blocking prevented the receipt window from opening."); }
    const cleanup = () => window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    win.addEventListener("load", () => { win.focus(); win.print(); cleanup(); }, { once: true });
  }

  async function submitReturn() {
    if (!selected || busy) return;
    const items = (selected.items || []).map((item) => ({ transaction_item_id: item.id, quantity: Math.max(0, Math.floor(n(returnQty[String(item.id)]))) })).filter((item) => item.quantity > 0);
    if (!items.length) return setError("Select at least one quantity to return.");
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await operationsRequest<Row>(`transactions/${encodeURIComponent(String(selected.id))}/return`, { method: "POST", body: JSON.stringify({ items, resolution, notes: returnNotes || null, employee_id: staff.employeeId }) });
      setReturnOpen(false); setReturnNotes(""); setReturnQty({}); setMessage(`Return ${result.return_number || "completed"} processed.`); await openTransaction(selected); await loadRecent("");
    } catch (cause) { setError((cause as OperationsApiError).message || "Return could not be processed."); }
    finally { setBusy(false); }
  }

  async function submitVoid() {
    if (!selected || busy || !voidPin.trim() || !voidReason.trim()) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await operationsRequest(`transactions/${encodeURIComponent(String(selected.id))}/void`, { method: "PATCH", body: JSON.stringify({ pin: voidPin.trim(), reason: voidReason.trim() }) });
      setVoidOpen(false); setVoidPin(""); setVoidReason(""); setMessage(`Transaction ${selected.transaction_number || ""} voided with supervisor authorization.`); await openTransaction(selected); await loadRecent("");
    } catch (cause) { setError((cause as OperationsApiError).message || "Transaction could not be voided."); }
    finally { setBusy(false); }
  }

  return <section className="sc-tx-service" data-guide-id="transaction-service">
    <div className="sc-tx-service__head"><div><RefreshCw size={18}/><div><strong>Receipts, returns & transaction service</strong><span>Find completed sales without leaving checkout.</span></div></div><form onSubmit={(e: FormEvent) => { e.preventDefault(); void loadRecent(); }}><Search size={15}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Transaction number"/><button type="submit">Find</button></form></div>
    {error ? <div className="sc-tx-service__alert is-error">{error}</div> : null}{message ? <div className="sc-tx-service__alert is-success">{message}</div> : null}
    <div className="sc-tx-service__layout"><div className="sc-tx-service__list">{rows.length ? rows.map((row) => <button type="button" key={String(row.id)} className={selected && String(selected.id) === String(row.id) ? "is-active" : ""} onClick={() => void openTransaction(row)}><span><strong>{row.transaction_number || `Transaction ${row.id}`}</strong><small>{row.customer_name || "Walk-in"} · {row.payment_method || "—"}</small></span><span><strong>{money(n(row.total))}</strong><small>{row.created_at ? new Date(row.created_at).toLocaleString() : ""}</small></span></button>) : <div className="sc-tx-service__empty">No matching transactions.</div>}</div>
      <div className="sc-tx-service__detail">{selected ? <><div className="sc-tx-service__detail-head"><div><strong>{selected.transaction_number}</strong><span className={`status status--${String(selected.status || "completed")}`}>{selected.status || "completed"}</span></div><strong>{money(n(selected.total))}</strong></div><div className="sc-tx-service__meta"><span>{selected.customer_name || "Walk-in customer"}</span><span>{selected.employee_name || ""}</span><span>{selected.branch_name || ""}</span></div><div className="sc-tx-service__items">{(selected.items || []).map((item) => <div key={String(item.id)}><span><strong>{item.product_name}</strong><small>{item.sku}</small></span><span>{n(item.quantity)} × {money(n(item.unit_price))}</span></div>)}</div><div className="sc-tx-service__actions"><button onClick={printReceipt}><Printer size={15}/>Receipt / reprint</button>{canReturn && selected.status === "completed" && !selected.rental_agreement_id ? <button onClick={() => setReturnOpen(true)}><RotateCcw size={15}/>Return items</button> : null}{selected.status === "completed" ? <button className="is-danger" onClick={() => setVoidOpen(true)}><Ban size={15}/>Void with supervisor</button> : null}</div></> : <div className="sc-tx-service__empty">Select a transaction to view receipt and service actions.</div>}</div></div>

    {returnOpen && selected ? <div className="sc-tx-modal"><div className="sc-tx-modal__card"><div className="sc-tx-modal__head"><div><strong>Return items</strong><span>{selected.transaction_number}</span></div><button onClick={() => setReturnOpen(false)}><X size={17}/></button></div><div className="sc-tx-return-lines">{(selected.items || []).map((item) => { const returned = returnedByItem.get(String(item.id)) || 0; const available = Math.max(0, n(item.quantity) - returned); return <label key={String(item.id)}><span><strong>{item.product_name}</strong><small>Purchased {n(item.quantity)} · already returned {returned} · available {available}</small></span><input type="number" min="0" max={available} step="1" value={returnQty[String(item.id)] || ""} onChange={(e) => setReturnQty((v) => ({ ...v, [String(item.id)]: e.target.value }))}/></label>; })}</div><label className="sc-tx-field"><span>Resolution</span><select value={resolution} onChange={(e) => setResolution(e.target.value)}><option value="refund">Refund</option><option value="replacement">Replacement</option><option value="credit_note">Credit note</option></select></label><label className="sc-tx-field"><span>Reason / notes</span><textarea rows={3} value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)}/></label><div className="sc-tx-modal__actions"><button className="sc-button sc-button--secondary" onClick={() => setReturnOpen(false)}>Cancel</button><button className="sc-button sc-button--primary" onClick={() => void submitReturn()} disabled={busy}>Process return</button></div></div></div> : null}

    {voidOpen && selected ? <div className="sc-tx-modal"><div className="sc-tx-modal__card is-compact"><div className="sc-tx-modal__head"><div><strong>Supervisor void authorization</strong><span>{selected.transaction_number} · {money(n(selected.total))}</span></div><button onClick={() => setVoidOpen(false)}><X size={17}/></button></div><div className="sc-tx-warning"><ShieldCheck size={18}/><span>The authorizing PIN must belong to an active employee with the POS <strong>void transactions</strong> privilege. The cashier does not need to know or hold that privilege.</span></div><label className="sc-tx-field"><span>Supervisor override PIN</span><input type="password" inputMode="numeric" value={voidPin} onChange={(e) => setVoidPin(e.target.value.replace(/\D/g, ""))}/></label><label className="sc-tx-field"><span>Void reason</span><textarea rows={3} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} required/></label><div className="sc-tx-modal__actions"><button className="sc-button sc-button--secondary" onClick={() => setVoidOpen(false)}>Cancel</button><button className="sc-button sc-button--primary" onClick={() => void submitVoid()} disabled={busy || !voidPin || !voidReason.trim()}>Authorize void</button></div></div></div> : null}
  </section>;
}
