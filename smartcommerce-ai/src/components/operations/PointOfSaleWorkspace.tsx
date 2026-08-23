import { Banknote, CheckCircle2, CreditCard, Minus, PackageSearch, PauseCircle, Plus, RefreshCw, Search, ShoppingCart, UserRound, WalletCards, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { operationsRequest, type OperationsApiError, type StaffIdentity } from "../../lib/staffOperations";
import "../../styles/point-of-sale-workspace.css";
import "../../styles/pos-variation-picker.css";

type Row = Record<string, any>;
type Product = Row & { id: string | number; name: string; sku?: string; barcode?: string; price: number; list_price?: number; tax_rate?: number; stock_qty?: number; is_service?: number; is_non_inventory?: number; has_variations?: number };
type Variation = Row & { id: string | number; product_id?: string | number; name: string; sku?: string; barcode?: string; price?: number | null; price_modifier?: number; stock_qty?: number; active?: number };
type Customer = Row & { id: string | number; first_name?: string; last_name?: string; customer_number?: string; phone?: string; email?: string; customer_type?: string; account_blocked?: number };
type CartLine = { key: string; product: Product; variation?: Variation; quantity: number; unitPrice: number; available: number };
type Drawer = Row & { id: string | number; name: string; branch_id?: string | number; active_session_id?: string | number; active_employee_id?: string | number; active_employee_name?: string };
type DrawerSession = Row & { id: string | number; drawer_id?: string | number; branch_id?: string | number; employee_id?: string | number; status?: string; opening_float?: number; drawer_name?: string };
type Tender = { method: string; amount: string; approval_code: string };
type Sale = Row & { id: string | number; transaction_number?: string; total?: number; change_amount?: number; payment_method?: string };

const currency = new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", maximumFractionDigits: 2 });
const money = (value: number) => currency.format(Number.isFinite(value) ? value : 0);
const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const customerName = (customer?: Customer | null) => customer ? [customer.first_name, customer.last_name].filter(Boolean).join(" ") || customer.customer_number || `Customer ${customer.id}` : "Walk-in customer";
const baseCheckoutPrice = (product: Product) => n(product.list_price ?? product.price);
const variationCheckoutPrice = (product: Product, variation: Variation) => variation.price != null ? n(variation.price) : Math.max(0, baseCheckoutPrice(product) + n(variation.price_modifier));

function can(staff: StaffIdentity, key: string) {
  if (Object.prototype.hasOwnProperty.call(staff.permissions, key)) return staff.permissions[key] === true;
  const parent = key.startsWith("pos_") ? "pos" : key.startsWith("drawers_") ? "drawers" : key;
  return staff.permissions[parent] === true;
}

export default function PointOfSaleWorkspace({ staff }: { staff: StaffIdentity }) {
  const branchId = String(staff.defaultBranchId || "");
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [variationProduct, setVariationProduct] = useState<Product | null>(null);
  const [variations, setVariations] = useState<Variation[]>([]);
  const [variationBusy, setVariationBusy] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [drawerSession, setDrawerSession] = useState<DrawerSession | null>(null);
  const [drawers, setDrawers] = useState<Drawer[]>([]);
  const [drawerId, setDrawerId] = useState("");
  const [openingFloat, setOpeningFloat] = useState("0");
  const [drawerBusy, setDrawerBusy] = useState(false);
  const [discount, setDiscount] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [amountTendered, setAmountTendered] = useState("");
  const [approvalCode, setApprovalCode] = useState("");
  const [split, setSplit] = useState(false);
  const [tenders, setTenders] = useState<Tender[]>([{ method: "cash", amount: "", approval_code: "" }, { method: "card", amount: "", approval_code: "" }]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [held, setHeld] = useState<Row[]>([]);
  const [recalledHoldId, setRecalledHoldId] = useState<string | null>(null);

  const subtotal = useMemo(() => cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0), [cart]);
  const tax = useMemo(() => cart.reduce((sum, line) => sum + line.unitPrice * line.quantity * n(line.product.tax_rate) / 100, 0), [cart]);
  const discountAmount = Math.max(0, Math.min(subtotal + tax, n(discount)));
  const total = Math.max(0, subtotal + tax - discountAmount);
  const tendered = split ? total : n(amountTendered || total);
  const change = paymentMethod === "credit" || split ? 0 : Math.max(0, tendered - total);
  const splitSum = tenders.reduce((sum, tender) => sum + n(tender.amount), 0);

  async function loadDrawer() {
    if (!branchId) return;
    try {
      const [sessions, drawerRows] = await Promise.all([
        operationsRequest<DrawerSession[]>(`drawers/sessions?employee_id=${encodeURIComponent(staff.employeeId)}&status=open`),
        operationsRequest<Drawer[]>(`drawers?branch_id=${encodeURIComponent(branchId)}`),
      ]);
      setDrawerSession(Array.isArray(sessions) && sessions.length ? sessions[0] : null);
      const available = (Array.isArray(drawerRows) ? drawerRows : []).filter((row) => !row.active_session_id || String(row.active_employee_id || "") === String(staff.employeeId));
      setDrawers(available);
      if (!drawerId && available.length) setDrawerId(String(available[0].id));
    } catch (cause) { setError((cause as OperationsApiError).message || "Drawer status could not be loaded."); }
  }

  async function loadHeld() {
    if (!can(staff, "pos_hold")) return;
    try {
      const rows = await operationsRequest<Row[]>(`transactions?status=hold${branchId ? `&branch_id=${encodeURIComponent(branchId)}` : ""}&limit=25`);
      setHeld(Array.isArray(rows) ? rows : []);
    } catch { setHeld([]); }
  }

  useEffect(() => { void loadDrawer(); void loadHeld(); }, [branchId, staff.employeeId]);

  async function openVariationPicker(product: Product, exactCode?: string) {
    setVariationProduct(product); setVariationBusy(true); setError("");
    try {
      const rows = await operationsRequest<Variation[]>(`inventory/${encodeURIComponent(String(product.id))}/variations`);
      const active = (Array.isArray(rows) ? rows : []).filter((row) => row.active !== 0);
      if (!active.length) { setVariationProduct(null); return setError(`${product.name} has no active variations.`); }
      const exact = exactCode ? active.find((row) => [row.sku, row.barcode].some((v) => String(v || "").toLowerCase() === exactCode.toLowerCase())) : undefined;
      if (exact) { addLine(product, exact); setVariationProduct(null); setQuery(""); setProducts([]); }
      else setVariations(active);
    } catch (cause) { setVariationProduct(null); setError((cause as OperationsApiError).message || "Product variations could not be loaded."); }
    finally { setVariationBusy(false); }
  }

  async function searchProducts(event?: FormEvent) {
    event?.preventDefault();
    if (!branchId) return setError("Your staff profile needs an assigned branch before checkout can be used.");
    setSearching(true); setError("");
    try {
      const rows = await operationsRequest<Product[]>(`inventory?branch_id=${encodeURIComponent(branchId)}&active=1&is_rental=0&search=${encodeURIComponent(query.trim())}`);
      const list = (Array.isArray(rows) ? rows : []).filter((row) => !row.is_rental).slice(0, 80);
      setProducts(list);
      const code = query.trim().toLowerCase();
      const exactBase = list.find((row) => code && [row.sku, row.barcode].some((value) => String(value || "").toLowerCase() === code));
      if (exactBase) {
        if (Number(exactBase.has_variations || 0) > 0) await openVariationPicker(exactBase, code);
        else { addLine(exactBase); setQuery(""); setProducts([]); }
        return;
      }
      if (code) {
        for (const product of list.filter((row) => Number(row.has_variations || 0) > 0).slice(0, 12)) {
          const variationRows = await operationsRequest<Variation[]>(`inventory/${encodeURIComponent(String(product.id))}/variations`);
          const exactVariation = (Array.isArray(variationRows) ? variationRows : []).find((row) => row.active !== 0 && [row.sku, row.barcode].some((value) => String(value || "").toLowerCase() === code));
          if (exactVariation) { addLine(product, exactVariation); setQuery(""); setProducts([]); return; }
        }
      }
    } catch (cause) { setError((cause as OperationsApiError).message || "Product search failed."); }
    finally { setSearching(false); }
  }

  async function searchCustomers(event?: FormEvent) {
    event?.preventDefault(); setError("");
    try {
      const rows = await operationsRequest<Customer[]>(`customers?active=1&search=${encodeURIComponent(customerQuery.trim())}`);
      setCustomers((Array.isArray(rows) ? rows : []).slice(0, 30)); setCustomerOpen(true);
    } catch (cause) { setError((cause as OperationsApiError).message || "Customer search failed."); }
  }

  function addLine(product: Product, variation?: Variation) {
    const key = variation ? `${product.id}:${variation.id}` : String(product.id);
    const current = cart.find((line) => line.key === key);
    const nextQty = (current?.quantity || 0) + 1;
    const controlled = !Number(product.is_service || 0) && !Number(product.is_non_inventory || 0);
    const available = controlled ? Math.max(0, Math.min(n(product.stock_qty), variation ? n(variation.stock_qty) : n(product.stock_qty))) : Number.MAX_SAFE_INTEGER;
    if (controlled && nextQty > available) { setError(`Only ${available} ${variation ? `${product.name} — ${variation.name}` : product.name} available.`); return; }
    const unitPrice = variation ? variationCheckoutPrice(product, variation) : baseCheckoutPrice(product);
    setError("");
    setCart((rows) => current ? rows.map((line) => line.key === key ? { ...line, quantity: nextQty } : line) : [...rows, { key, product, variation, quantity: 1, unitPrice, available }]);
  }

  function setQuantity(key: string, quantity: number) {
    setCart((rows) => rows.flatMap((line) => {
      if (line.key !== key) return [line];
      if (quantity <= 0) return [];
      if (quantity > line.available) { setError(`Only ${line.available} ${line.product.name}${line.variation ? ` — ${line.variation.name}` : ""} available.`); return [line]; }
      return [{ ...line, quantity }];
    }));
  }

  async function openDrawer(event: FormEvent) {
    event.preventDefault(); if (!drawerId || drawerBusy) return;
    setDrawerBusy(true); setError("");
    try {
      const session = await operationsRequest<DrawerSession>("drawers/sessions", { method: "POST", body: JSON.stringify({ drawer_id: drawerId, branch_id: branchId || null, employee_id: staff.employeeId, opening_float: Math.max(0, n(openingFloat)) }) });
      setDrawerSession(session); setMessage("Drawer session opened.");
    } catch (cause) { setError((cause as OperationsApiError).message || "Drawer could not be opened."); }
    finally { setDrawerBusy(false); }
  }

  async function holdSale() {
    if (!cart.length || busy || !can(staff, "pos_hold")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await operationsRequest<Row>("transactions/hold", { method: "POST", body: JSON.stringify({ customer_id: customer?.id || null, employee_id: staff.employeeId, branch_id: branchId || null, items: cart.map((line) => ({ product_id: line.product.id, product_name: line.variation ? `${line.product.name} — ${line.variation.name}` : line.product.name, sku: line.variation?.sku || line.product.sku || "", quantity: line.quantity, unit_price: line.unitPrice, tax_rate: n(line.product.tax_rate), variation_id: line.variation?.id || null, variation_name: line.variation?.name || null })), discount_amount: can(staff, "pos_discounts") ? discountAmount : 0, notes: notes || null }) });
      if (recalledHoldId) await operationsRequest(`transactions/${encodeURIComponent(recalledHoldId)}/hold`, { method: "DELETE" }).catch(() => undefined);
      clearCart(); setMessage(`Sale held as ${result.transaction_number || "held order"}.`); await loadHeld();
    } catch (cause) { setError((cause as OperationsApiError).message || "Sale could not be held."); }
    finally { setBusy(false); }
  }

  async function recallHold(row: Row) {
    setBusy(true); setError("");
    try {
      const detail = await operationsRequest<Row>(`transactions/${encodeURIComponent(String(row.id))}`);
      const lines: CartLine[] = [];
      for (const item of Array.isArray(detail.items) ? detail.items : []) {
        const found = await operationsRequest<Product[]>(`inventory?branch_id=${encodeURIComponent(branchId)}&active=1&search=${encodeURIComponent(String(item.sku || item.product_name || ""))}`);
        const product = (Array.isArray(found) ? found : []).find((p) => String(p.id) === String(item.product_id));
        if (!product) throw new Error(`Held item ${item.product_name || item.sku} is no longer in the branch catalog.`);
        let variation: Variation | undefined;
        if (item.variation_id) {
          const vr = await operationsRequest<Variation[]>(`inventory/${encodeURIComponent(String(product.id))}/variations`);
          variation = (Array.isArray(vr) ? vr : []).find((v) => String(v.id) === String(item.variation_id));
          if (!variation) throw new Error(`Variation for ${item.product_name} is no longer available.`);
        }
        const available = Math.max(0, Math.min(n(product.stock_qty), variation ? n(variation.stock_qty) : n(product.stock_qty)));
        lines.push({ key: variation ? `${product.id}:${variation.id}` : String(product.id), product, variation, quantity: Math.max(1, n(item.quantity)), unitPrice: n(item.unit_price), available });
      }
      setCart(lines); setDiscount(String(n(detail.discount_amount))); setNotes(String(detail.notes || "")); setRecalledHoldId(String(detail.id));
      if (detail.customer_id) setCustomer(await operationsRequest<Customer>(`customers/${encodeURIComponent(String(detail.customer_id))}`)); else setCustomer(null);
      setMessage(`Recalled ${detail.transaction_number || "held sale"}. The original hold is preserved until checkout succeeds.`);
    } catch (cause) { setError((cause as Error).message || "Held sale could not be recalled."); }
    finally { setBusy(false); }
  }

  function clearCart() { setCart([]); setCustomer(null); setDiscount("0"); setNotes(""); setAmountTendered(""); setApprovalCode(""); setRecalledHoldId(null); }

  async function checkout() {
    if (!cart.length || busy) return;
    if (!drawerSession) return setError("Open a cash drawer session before completing a POS sale.");
    if (split && Math.abs(splitSum - total) > 0.01) return setError(`Split tenders must total exactly ${money(total)}.`);
    if (paymentMethod === "credit" && (!customer || customer.customer_type !== "credit" || customer.account_blocked)) return setError("Charge Account requires an eligible, unblocked credit customer.");
    if (!split && paymentMethod !== "credit" && n(amountTendered || total) + 0.001 < total) return setError("Amount tendered cannot be less than the sale total.");
    setBusy(true); setError(""); setMessage("");
    try {
      const payload: Row = { customer_id: customer?.id || null, employee_id: staff.employeeId, branch_id: branchId || null, drawer_session_id: drawerSession.id, items: cart.map((line) => ({ product_id: line.product.id, variation_id: line.variation?.id || null, quantity: line.quantity })), discount_amount: can(staff, "pos_discounts") ? discountAmount : 0, notes: notes || null };
      if (split) payload.tenders = tenders.map((tender) => ({ method: tender.method, amount: n(tender.amount), approval_code: tender.approval_code || null }));
      else { payload.payment_method = paymentMethod; payload.amount_tendered = paymentMethod === "credit" ? 0 : n(amountTendered || total); payload.approval_code = approvalCode || null; }
      const sale = await operationsRequest<Sale>("transactions", { method: "POST", body: JSON.stringify(payload) });
      let holdWarning = "";
      if (recalledHoldId) try { await operationsRequest(`transactions/${encodeURIComponent(recalledHoldId)}/hold`, { method: "DELETE" }); } catch { holdWarning = " Original hold still requires manual cleanup."; }
      setLastSale(sale); clearCart(); setMessage(`Sale ${sale.transaction_number || "completed"} completed.${holdWarning}`); await loadHeld();
    } catch (cause) { setError((cause as OperationsApiError).message || "Checkout failed."); }
    finally { setBusy(false); }
  }

  return <section className="sc-pos" data-guide-id="pos-checkout-workspace">
    <div className="sc-pos__statusbar"><div><ShoppingCart size={18}/><span>Modern POS Checkout</span><strong>{branchId ? staff.defaultBranchName || `Branch ${branchId}` : "Branch required"}</strong></div><div className={drawerSession ? "is-open" : "is-closed"}><WalletCards size={17}/><span>Drawer</span><strong>{drawerSession ? `Session ${drawerSession.id} · Open` : "Not open"}</strong><button type="button" onClick={() => void loadDrawer()}><RefreshCw size={14}/></button></div></div>
    <div className="sc-pos__notice">Checkout prices intentionally mirror the source transaction engine. Branch-tier catalog pricing is not applied to payment until the upstream POS transaction endpoint supports it.</div>
    {error ? <div className="sc-pos__alert is-error">{error}</div> : null}{message ? <div className="sc-pos__alert is-success"><CheckCircle2 size={16}/>{message}</div> : null}
    {!drawerSession ? <form className="sc-pos__drawer-open" onSubmit={openDrawer}><WalletCards size={18}/><label>Drawer<select value={drawerId} onChange={(e) => setDrawerId(e.target.value)}><option value="">Select drawer</option>{drawers.map((d) => <option key={String(d.id)} value={String(d.id)}>{d.name}</option>)}</select></label><label>Opening float<input type="number" min="0" step="0.01" value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)}/></label><button className="sc-button sc-button--primary" disabled={!drawerId || drawerBusy}><Banknote size={16}/>Open drawer</button></form> : null}

    <div className="sc-pos__grid"><div className="sc-pos__catalog"><form className="sc-pos__search" onSubmit={searchProducts}><Search size={18}/><input data-guide-id="pos-product-search" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Scan barcode or search SKU / product"/><button type="submit" disabled={searching}>{searching ? "Searching…" : "Search"}</button></form><div className="sc-pos__products">{products.length ? products.map((p) => <button key={String(p.id)} type="button" onClick={() => Number(p.has_variations || 0) > 0 ? void openVariationPicker(p) : addLine(p)}><span><strong>{p.name}</strong><small>{p.sku || p.barcode || ""}</small></span><span><strong>{money(baseCheckoutPrice(p))}</strong><small>{n(p.stock_qty)} available{Number(p.has_variations || 0) > 0 ? " · choose variation" : ""}</small></span></button>) : <div className="sc-pos__empty"><PackageSearch size={24}/><span>Search or scan an item to start.</span></div>}</div>
      {can(staff, "pos_hold") && held.length ? <div className="sc-pos__holds"><div><PauseCircle size={16}/><strong>Held sales</strong></div>{held.map((row) => <button key={String(row.id)} onClick={() => void recallHold(row)}><span>{row.transaction_number}</span><strong>{money(n(row.total))}</strong></button>)}</div> : null}</div>

      <div className="sc-pos__cart"><div className="sc-pos__customer"><UserRound size={17}/><form onSubmit={searchCustomers}><input value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} placeholder="Find customer"/><button>Find</button></form><strong>{customerName(customer)}</strong>{customer ? <button type="button" onClick={() => setCustomer(null)}>Clear</button> : null}</div>{customerOpen ? <div className="sc-pos__customer-results">{customers.map((c) => <button key={String(c.id)} onClick={() => { setCustomer(c); setCustomerOpen(false); setCustomerQuery(""); }}><strong>{customerName(c)}</strong><span>{c.customer_number || c.phone || c.email || ""}</span></button>)}</div> : null}
        <div className="sc-pos__cart-lines">{cart.length ? cart.map((line) => <div key={line.key}><span><strong>{line.product.name}{line.variation ? ` — ${line.variation.name}` : ""}</strong><small>{line.variation?.sku || line.product.sku || ""} · {money(line.unitPrice)} each</small></span><div><button onClick={() => setQuantity(line.key, line.quantity - 1)}><Minus size={14}/></button><strong>{line.quantity}</strong><button onClick={() => setQuantity(line.key, line.quantity + 1)}><Plus size={14}/></button></div><strong>{money(line.unitPrice * line.quantity)}</strong></div>) : <div className="sc-pos__empty">Cart is empty.</div>}</div>
        <div className="sc-pos__totals"><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><div><span>Tax</span><strong>{money(tax)}</strong></div>{can(staff, "pos_discounts") ? <label><span>Discount</span><input type="number" min="0" max={subtotal + tax} step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)}/></label> : null}<div className="is-total"><span>Total</span><strong>{money(total)}</strong></div></div>
        <textarea className="sc-pos__notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Sale notes (optional)"/>
        <div className="sc-pos__payment"><div className="sc-pos__payment-head"><strong>Payment</strong><label><input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)}/> Split tender</label></div>{split ? <div className="sc-pos__split">{tenders.map((t, i) => <div key={i}><select value={t.method} onChange={(e) => setTenders((rows) => rows.map((r, x) => x === i ? { ...r, method: e.target.value } : r))}><option value="cash">Cash</option><option value="card">Card</option><option value="check">Cheque</option><option value="gift_card">Gift card</option><option value="direct_deposit">Direct deposit</option></select><input type="number" min="0" step="0.01" value={t.amount} onChange={(e) => setTenders((rows) => rows.map((r, x) => x === i ? { ...r, amount: e.target.value } : r))} placeholder="Amount"/><input value={t.approval_code} onChange={(e) => setTenders((rows) => rows.map((r, x) => x === i ? { ...r, approval_code: e.target.value } : r))} placeholder="Approval / ref"/></div>)}<small className={Math.abs(splitSum - total) <= .01 ? "is-balanced" : ""}>Tendered {money(splitSum)} / {money(total)}</small></div> : <><select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}><option value="cash">Cash</option><option value="card">Card</option><option value="check">Cheque</option><option value="gift_card">Gift card</option><option value="direct_deposit">Direct deposit</option><option value="credit">Charge account</option></select>{paymentMethod !== "credit" ? <label>Amount tendered<input type="number" min="0" step="0.01" value={amountTendered} onChange={(e) => setAmountTendered(e.target.value)} placeholder={total.toFixed(2)}/></label> : null}{["card","direct_deposit"].includes(paymentMethod) ? <label>Approval / reference<input value={approvalCode} onChange={(e) => setApprovalCode(e.target.value)}/></label> : null}{paymentMethod === "cash" ? <div className="sc-pos__change"><span>Change</span><strong>{money(change)}</strong></div> : null}</>}</div>
        <div className="sc-pos__checkout-actions">{can(staff, "pos_hold") ? <button className="sc-button sc-button--secondary" disabled={!cart.length || busy} onClick={() => void holdSale()}><PauseCircle size={16}/>Hold</button> : null}<button data-guide-id="pos-complete-sale" className="sc-button sc-button--primary" disabled={!cart.length || busy || !drawerSession} onClick={() => void checkout()}><CreditCard size={17}/>{busy ? "Processing…" : `Complete ${money(total)}`}</button></div>
        {lastSale ? <div className="sc-pos__last-sale"><CheckCircle2 size={18}/><span><strong>{lastSale.transaction_number || "Sale completed"}</strong><small>{money(n(lastSale.total))}{n(lastSale.change_amount) > 0 ? ` · change ${money(n(lastSale.change_amount))}` : ""}</small></span></div> : null}
      </div></div>

    {variationProduct ? <div className="sc-pos-variation-modal" role="dialog" aria-modal="true" aria-label={`Choose ${variationProduct.name} variation`}><div className="sc-pos-variation-card"><div className="sc-pos-variation-head"><div><strong>{variationProduct.name}</strong><span>Choose the exact SKU / variation being sold.</span></div><button onClick={() => setVariationProduct(null)}><X size={18}/></button></div>{variationBusy ? <div className="sc-pos__empty">Loading variations…</div> : <div className="sc-pos-variation-list">{variations.map((variation) => { const available = Math.max(0, Math.min(n(variation.stock_qty), n(variationProduct.stock_qty))); const price = variationCheckoutPrice(variationProduct, variation); return <button key={String(variation.id)} disabled={available <= 0} onClick={() => { addLine(variationProduct, variation); setVariationProduct(null); }}><span><strong>{variation.name}</strong><small>{variation.sku || variation.barcode || ""}</small></span><span><strong>{money(price)}</strong><small>{available} available</small></span></button>; })}</div>}</div></div> : null}
  </section>;
}
