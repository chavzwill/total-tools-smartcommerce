import { CheckCircle2, Copy, FileText, Loader2, PackageCheck, RefreshCw, Search, Send, ShoppingCart, XCircle } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { operationsRequest, type OperationsApiError, type StaffIdentity } from "../../lib/staffOperations";
import "../../styles/quotation-workspace.css";

type Row = Record<string, any>;
type Quote = Row & { id: string | number; quote_number?: string; status?: string; customer_name?: string; branch_name?: string; total?: number; valid_until?: string; quote_type?: string; items?: Row[] };
type Product = Row & { id: string | number; name: string; sku?: string; price?: number; tax_rate?: number; stock_qty?: number };
type Customer = Row & { id: string | number; first_name?: string; last_name?: string; customer_number?: string };
type DraftLine = { product_id?: string | number; description?: string; product_name?: string; sku?: string; quantity: number; unit_price: number };

const money = (v: unknown) => new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", maximumFractionDigits: 2 }).format(Number(v || 0));
const n = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0;
const customerLabel = (c: Customer) => [c.first_name, c.last_name].filter(Boolean).join(" ") || c.customer_number || `Customer ${c.id}`;
function can(staff: StaffIdentity, key: string) {
  if (Object.prototype.hasOwnProperty.call(staff.permissions, key)) return staff.permissions[key] === true;
  return staff.permissions.quotations === true;
}

export default function QuotationWorkspace({ staff }: { staff: StaffIdentity }) {
  const branchId = String(staff.defaultBranchId || "");
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [selected, setSelected] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [discount, setDiscount] = useState("0");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const subtotal = useMemo(() => lines.reduce((s, l) => s + n(l.unit_price) * n(l.quantity), 0), [lines]);
  const total = Math.max(0, subtotal - n(discount));

  async function loadQuotes() {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("quote_number", query.trim());
      if (status) params.set("status", status);
      params.set("limit", "100");
      const rows = await operationsRequest<Quote[]>(`quotations?${params.toString()}`);
      setQuotes(Array.isArray(rows) ? rows : []);
    } catch (cause) { setError((cause as OperationsApiError).message || "Quotations could not be loaded."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadQuotes(); }, []);

  async function openQuote(id: string | number) {
    setError("");
    try { setSelected(await operationsRequest<Quote>(`quotations/${encodeURIComponent(String(id))}`)); }
    catch (cause) { setError((cause as OperationsApiError).message || "Quotation could not be opened."); }
  }

  async function searchCustomers(event?: FormEvent) {
    event?.preventDefault();
    try {
      const rows = await operationsRequest<Customer[]>(`customers?active=1&search=${encodeURIComponent(customerQuery.trim())}`);
      setCustomers((Array.isArray(rows) ? rows : []).slice(0, 20));
    } catch (cause) { setError((cause as OperationsApiError).message || "Customer search failed."); }
  }

  async function searchProducts(event?: FormEvent) {
    event?.preventDefault();
    try {
      const rows = await operationsRequest<Product[]>(`inventory?branch_id=${encodeURIComponent(branchId)}&active=1&is_rental=0&search=${encodeURIComponent(productQuery.trim())}`);
      setProducts((Array.isArray(rows) ? rows : []).slice(0, 30));
    } catch (cause) { setError((cause as OperationsApiError).message || "Product search failed."); }
  }

  function resetEditor() {
    setEditingId(null); setCustomer(null); setCustomerQuery(""); setCustomers([]); setProductQuery(""); setProducts([]); setLines([]); setDiscount("0"); setValidUntil(""); setNotes("");
  }

  function createNew() { resetEditor(); setEditorOpen(true); }

  async function editQuote(quote: Quote) {
    setBusy(true); setError("");
    try {
      const detail = await operationsRequest<Quote>(`quotations/${encodeURIComponent(String(quote.id))}`);
      setEditingId(String(detail.id));
      setCustomer(detail.customer_id ? { id: detail.customer_id, first_name: String(detail.customer_name || "") } : null);
      setLines((detail.items || []).map((item: Row) => ({ product_id: item.product_id || undefined, description: item.is_temp_item ? item.product_name : undefined, product_name: item.product_name, sku: item.sku, quantity: n(item.quantity) || 1, unit_price: n(item.unit_price) })));
      setDiscount(String(n(detail.discount_amount)));
      setValidUntil(String(detail.valid_until || "").slice(0,10));
      setNotes(String(detail.notes || ""));
      setEditorOpen(true);
    } catch (cause) { setError((cause as OperationsApiError).message || "Quotation could not be edited."); }
    finally { setBusy(false); }
  }

  function copyQuote(quote: Quote) {
    void (async () => {
      const detail = await operationsRequest<Quote>(`quotations/${encodeURIComponent(String(quote.id))}`);
      setEditingId(null);
      setCustomer(detail.customer_id ? { id: detail.customer_id, first_name: String(detail.customer_name || "") } : null);
      setLines((detail.items || []).map((item: Row) => ({ product_id: item.product_id || undefined, description: item.is_temp_item ? item.product_name : undefined, product_name: item.product_name, sku: item.sku, quantity: n(item.quantity) || 1, unit_price: n(item.unit_price) })));
      setDiscount(String(n(detail.discount_amount))); setValidUntil(String(detail.valid_until || "").slice(0,10)); setNotes(`Copied from ${detail.quote_number || "quotation"}${detail.notes ? `\n${detail.notes}` : ""}`); setEditorOpen(true);
    })().catch((cause) => setError((cause as OperationsApiError).message || "Quotation could not be copied."));
  }

  async function saveQuote() {
    if (!lines.length || busy) return setError("Add at least one quotation line.");
    setBusy(true); setError(""); setMessage("");
    try {
      const payload = {
        customer_id: customer?.id || null,
        employee_id: staff.employeeId,
        branch_id: branchId || null,
        quote_type: "sale",
        items: lines.map((line) => line.product_id ? { product_id: line.product_id, quantity: line.quantity, unit_price: line.unit_price } : { description: line.description || line.product_name || "Off-catalog item", quantity: line.quantity, unit_price: line.unit_price }),
        discount_amount: Math.max(0, n(discount)),
        valid_until: validUntil || null,
        notes: notes || null,
      };
      const saved = editingId
        ? await operationsRequest<Quote>(`quotations/${encodeURIComponent(editingId)}`, { method: "PUT", body: JSON.stringify(payload) })
        : await operationsRequest<Quote>("quotations", { method: "POST", body: JSON.stringify(payload) });
      setEditorOpen(false); resetEditor(); setMessage(`${saved.quote_number || "Quotation"} ${editingId ? "updated" : "created"}.`); await loadQuotes();
    } catch (cause) { setError((cause as OperationsApiError).message || "Quotation could not be saved."); }
    finally { setBusy(false); }
  }

  async function changeStatus(quote: Quote, next: string) {
    setBusy(true); setError("");
    try {
      await operationsRequest(`quotations/${encodeURIComponent(String(quote.id))}/status`, { method: "PATCH", body: JSON.stringify({ status: next }) });
      setMessage(`${quote.quote_number || "Quotation"} marked ${next}.`); await loadQuotes(); await openQuote(quote.id);
    } catch (cause) { setError((cause as OperationsApiError).message || "Quotation status could not be changed."); }
    finally { setBusy(false); }
  }

  async function convert(quote: Quote) {
    setBusy(true); setError("");
    try {
      const result = await operationsRequest<Row>(`quotations/${encodeURIComponent(String(quote.id))}/convert`, { method: "POST", body: JSON.stringify({ employee_id: staff.employeeId, branch_id: branchId || null }) });
      setMessage(`${quote.quote_number || "Quotation"} converted to ${result.transaction_number || "a held POS sale"}. Recall it from POS to collect payment.`); await loadQuotes(); await openQuote(quote.id);
    } catch (cause) { setError((cause as OperationsApiError).message || "Quotation could not be converted."); }
    finally { setBusy(false); }
  }

  return <section className="sc-quote" data-guide-id="quotation-workspace">
    <div className="sc-quote__head"><div><FileText size={20}/><div><strong>Commercial quotations</strong><span>Create, send, accept, source and convert customer quotes.</span></div></div><button onClick={() => void loadQuotes()}><RefreshCw size={15}/>Refresh</button></div>
    {error ? <div className="sc-quote__alert is-error">{error}</div> : null}
    {message ? <div className="sc-quote__alert is-success"><CheckCircle2 size={16}/>{message}</div> : null}
    <div className="sc-quote__toolbar"><form onSubmit={(e) => { e.preventDefault(); void loadQuotes(); }}><Search size={16}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Quote number"/><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option>draft</option><option>sent</option><option>accepted</option><option>declined</option><option>converted</option></select><button type="submit">Search</button></form>{can(staff,"quotations_create") ? <button className="sc-button sc-button--primary" onClick={createNew}>New quotation</button> : null}</div>
    <div className="sc-quote__layout"><div className="sc-quote__list">{loading ? <div className="sc-quote__empty"><Loader2 className="sc-ops-spin"/>Loading quotations…</div> : quotes.length ? quotes.map((q) => <button key={String(q.id)} className={String(selected?.id)===String(q.id)?"is-selected":""} onClick={() => void openQuote(q.id)}><div><strong>{q.quote_number || `Quote ${q.id}`}</strong><span>{q.customer_name || "Walk-in / unassigned"}</span></div><div><span className={`status is-${q.status}`}>{q.status}</span><strong>{money(q.total)}</strong><small>{q.branch_name || ""}</small></div></button>) : <div className="sc-quote__empty">No quotations found.</div>}</div>
      <div className="sc-quote__detail">{selected ? <><div className="sc-quote__detail-head"><div><strong>{selected.quote_number}</strong><span>{selected.customer_name || "Unassigned customer"} · {selected.branch_name || "No branch"}</span></div><span className={`status is-${selected.status}`}>{selected.status}</span></div><div className="sc-quote__totals"><div><span>Subtotal</span><strong>{money(selected.subtotal)}</strong></div><div><span>Tax</span><strong>{money(selected.tax_amount)}</strong></div><div><span>Discount</span><strong>{money(selected.discount_amount)}</strong></div><div><span>Total</span><strong>{money(selected.total)}</strong></div></div><div className="sc-quote__items">{(selected.items||[]).map((item: Row) => <article key={String(item.id)}><div><strong>{item.product_name}</strong><span>{item.sku || "Off-catalog"}</span></div><div><span>{n(item.quantity)} × {money(item.unit_price)}</span><strong>{money(item.total)}</strong>{item.purchase_request_number ? <small>PR {item.purchase_request_number} · {item.purchase_request_status}</small> : null}{Array.isArray(item.sources)&&item.sources.length ? <small>{item.sources.map((s:Row)=>`${s.branch_name||"Purchase"}: ${s.quantity}`).join(" · ")}</small> : null}</div></article>)}</div><div className="sc-quote__actions">{can(staff,"quotations_create") && selected.status!=="converted" ? <><button onClick={() => void editQuote(selected)}><FileText size={15}/>Edit</button><button onClick={() => copyQuote(selected)}><Copy size={15}/>Copy as new</button></> : null}{selected.status==="draft" && can(staff,"quotations_create") ? <button onClick={() => void changeStatus(selected,"sent")}><Send size={15}/>Mark sent</button> : null}{selected.status!=="converted" && can(staff,"quotations_approve") ? <><button onClick={() => void changeStatus(selected,"accepted")}><PackageCheck size={15}/>Accept</button><button onClick={() => void changeStatus(selected,"declined")}><XCircle size={15}/>Decline</button></> : null}{selected.status==="accepted" && can(staff,"quotations_convert") ? <button className="sc-button sc-button--primary" onClick={() => void convert(selected)}><ShoppingCart size={15}/>Convert to POS hold</button> : null}</div></> : <div className="sc-quote__empty">Select a quotation to review its sourcing, purchasing and conversion state.</div>}</div></div>

    {editorOpen ? <div className="sc-quote-modal" role="dialog" aria-modal="true"><div className="sc-quote-modal__card"><div className="sc-quote-modal__head"><div><strong>{editingId ? "Edit quotation" : "New quotation"}</strong><span>Sales quotation at {staff.defaultBranchName || branchId || "assigned branch"}</span></div><button onClick={()=>{setEditorOpen(false);resetEditor();}}><XCircle size={18}/></button></div><form onSubmit={searchCustomers} className="sc-quote-search"><input value={customerQuery} onChange={(e)=>setCustomerQuery(e.target.value)} placeholder="Search customer"/><button type="submit">Find</button></form>{customers.length ? <div className="sc-quote-picks">{customers.map((c)=><button key={String(c.id)} onClick={()=>{setCustomer(c);setCustomers([]);}}>{customerLabel(c)}</button>)}</div> : null}<div className="sc-quote-selected">Customer: <strong>{customer ? customerLabel(customer) : "Unassigned"}</strong></div><form onSubmit={searchProducts} className="sc-quote-search"><input value={productQuery} onChange={(e)=>setProductQuery(e.target.value)} placeholder="Search product / SKU"/><button type="submit">Find</button></form>{products.length ? <div className="sc-quote-picks">{products.map((p)=><button key={String(p.id)} onClick={()=>{setLines((v)=>[...v,{product_id:p.id,product_name:p.name,sku:p.sku,quantity:1,unit_price:n(p.price)}]);setProducts([]);}}><span>{p.name}</span><small>{p.sku} · {money(p.price)} · Stock {n(p.stock_qty)}</small></button>)}</div> : null}<div className="sc-quote-lines">{lines.map((line,index)=><article key={index}><input value={line.product_name || line.description || ""} onChange={(e)=>setLines((v)=>v.map((l,i)=>i===index?{...l,description:e.target.value,product_name:e.target.value}:l))} disabled={!!line.product_id}/><input type="number" min="1" value={line.quantity} onChange={(e)=>setLines((v)=>v.map((l,i)=>i===index?{...l,quantity:Math.max(1,n(e.target.value))}:l))}/><input type="number" min="0" step="0.01" value={line.unit_price} onChange={(e)=>setLines((v)=>v.map((l,i)=>i===index?{...l,unit_price:n(e.target.value)}:l))}/><button onClick={()=>setLines((v)=>v.filter((_,i)=>i!==index))}>Remove</button></article>)}</div><button className="sc-button sc-button--secondary" onClick={()=>setLines((v)=>[...v,{description:"",quantity:1,unit_price:0}])}>Add off-catalog line</button><div className="sc-quote-form-grid"><label>Discount<input type="number" min="0" step="0.01" value={discount} onChange={(e)=>setDiscount(e.target.value)}/></label><label>Valid until<input type="date" value={validUntil} onChange={(e)=>setValidUntil(e.target.value)}/></label></div><label>Notes<textarea rows={3} value={notes} onChange={(e)=>setNotes(e.target.value)}/></label><div className="sc-quote-editor-total"><span>Estimated total before server tax</span><strong>{money(total)}</strong></div><div className="sc-quote-modal__actions"><button className="sc-button sc-button--secondary" onClick={()=>{setEditorOpen(false);resetEditor();}}>Cancel</button><button className="sc-button sc-button--primary" onClick={() => void saveQuote()} disabled={busy}>{busy ? <Loader2 className="sc-ops-spin" size={15}/> : <CheckCircle2 size={15}/>}Save quotation</button></div></div></div> : null}
  </section>;
}
