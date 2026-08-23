import { Banknote, CheckCircle2, CreditCard, Minus, PackageSearch, PauseCircle, Plus, ReceiptText, RefreshCw, Search, ShoppingCart, UserRound, WalletCards } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { operationsRequest, type OperationsApiError, type StaffIdentity } from "../../lib/staffOperations";
import "../../styles/point-of-sale-workspace.css";

type Row = Record<string, any>;
type Product = Row & { id: string | number; name: string; sku?: string; barcode?: string; price: number; tax_rate?: number; stock_qty?: number; is_service?: number; is_non_inventory?: number; has_variations?: number };
type Customer = Row & { id: string | number; first_name?: string; last_name?: string; customer_number?: string; phone?: string; email?: string; customer_type?: string; account_blocked?: number };
type CartLine = { product: Product; quantity: number };
type Drawer = Row & { id: string | number; name: string; branch_id?: string | number; active_session_id?: string | number; active_employee_id?: string | number; active_employee_name?: string };
type DrawerSession = Row & { id: string | number; drawer_id?: string | number; branch_id?: string | number; employee_id?: string | number; status?: string; opening_float?: number; drawer_name?: string };
type Tender = { method: string; amount: string; approval_code: string };
type Sale = Row & { id: string | number; transaction_number?: string; total?: number; change_amount?: number; payment_method?: string; items?: Row[]; payments?: Row[] };

const currency = new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", maximumFractionDigits: 2 });
const money = (value: number) => currency.format(Number.isFinite(value) ? value : 0);
const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const customerName = (customer?: Customer | null) => customer ? [customer.first_name, customer.last_name].filter(Boolean).join(" ") || customer.customer_number || `Customer ${customer.id}` : "Walk-in customer";

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

  const subtotal = useMemo(() => cart.reduce((sum, line) => sum + n(line.product.price) * line.quantity, 0), [cart]);
  const tax = useMemo(() => cart.reduce((sum, line) => sum + n(line.product.price) * line.quantity * n(line.product.tax_rate) / 100, 0), [cart]);
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
    } catch (cause) {
      setError((cause as OperationsApiError).message || "Drawer status could not be loaded.");
    }
  }

  async function loadHeld() {
    if (!can(staff, "pos_hold")) return;
    try {
      const rows = await operationsRequest<Row[]>(`transactions?status=hold${branchId ? `&branch_id=${encodeURIComponent(branchId)}` : ""}&limit=25`);
      setHeld(Array.isArray(rows) ? rows : []);
    } catch { setHeld([]); }
  }

  useEffect(() => { void loadDrawer(); void loadHeld(); }, [branchId, staff.employeeId]);

  async function searchProducts(event?: FormEvent) {
    event?.preventDefault();
    if (!branchId) return setError("Your staff profile needs an assigned branch before checkout can be used.");
    setSearching(true); setError("");
    try {
      const rows = await operationsRequest<Product[]>(`inventory?branch_id=${encodeURIComponent(branchId)}&active=1&is_rental=0&search=${encodeURIComponent(query.trim())}`);
      const list = (Array.isArray(rows) ? rows : []).filter((row) => !row.is_rental).slice(0, 80);
      setProducts(list);
      const exact = list.find((row) => query.trim() && [row.sku, row.barcode].some((value) => String(value || "").toLowerCase() === query.trim().toLowerCase()));
      if (exact && !Number(exact.has_variations || 0)) { addProduct(exact); setQuery(""); setProducts([]); }
    } catch (cause) { setError((cause as OperationsApiError).message || "Product search failed."); }
    finally { setSearching(false); }
  }

  async function searchCustomers(event?: FormEvent) {
    event?.preventDefault();
    setError("");
    try {
      const rows = await operationsRequest<Customer[]>(`customers?active=1&search=${encodeURIComponent(customerQuery.trim())}`);
      setCustomers((Array.isArray(rows) ? rows : []).slice(0, 30)); setCustomerOpen(true);
    } catch (cause) { setError((cause as OperationsApiError).message || "Customer search failed."); }
  }

  function addProduct(product: Product) {
    if (Number(product.has_variations || 0) > 0) { setError(`${product.name} has variations. Variation selection will be added in the next POS checkout slice.`); return; }
    const current = cart.find((line) => String(line.product.id) === String(product.id));
    const nextQty = (current?.quantity || 0) + 1;
    const inventoryControlled = !Number(product.is_service || 0) && !Number(product.is_non_inventory || 0);
    if (inventoryControlled && nextQty > n(product.stock_qty)) { setError(`Only ${n(product.stock_qty)} ${product.name} available at this branch.`); return; }
    setError("");
    setCart((rows) => current ? rows.map((line) => String(line.product.id) === String(product.id) ? { ...line, quantity: nextQty } : line) : [...rows, { product, quantity: 1 }]);
  }

  function setQuantity(productId: string | number, quantity: number) {
    setCart((rows) => rows.flatMap((line) => {
      if (String(line.product.id) !== String(productId)) return [line];
      if (quantity <= 0) return [];
      const controlled = !Number(line.product.is_service || 0) && !Number(line.product.is_non_inventory || 0);
      if (controlled && quantity > n(line.product.stock_qty)) { setError(`Only ${n(line.product.stock_qty)} ${line.product.name} available at this branch.`); return [line]; }
      return [{ ...line, quantity }];
    }));
  }

  async function openDrawer(event: FormEvent) {
    event.preventDefault(); if (!drawerId || drawerBusy) return;
    setDrawerBusy(true); setError("");
    try {
      const session = await operationsRequest<DrawerSession>("drawers/sessions", { method: "POST", body: JSON.stringify({ drawer_id: drawerId, branch_id: branchId || null, employee_id: staff.employeeId, opening_float: Math.max(0, n(openingFloat)) }) });
      setDrawerSession(session); setMessage(`Drawer session opened${session.drawer_name ? ` on ${session.drawer_name}` : ""}.`);
    } catch (cause) { setError((cause as OperationsApiError).message || "Drawer could not be opened."); }
    finally { setDrawerBusy(false); }
  }

  async function holdSale() {
    if (!cart.length || busy || !can(staff, "pos_hold")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await operationsRequest<Row>("transactions/hold", { method: "POST", body: JSON.stringify({ customer_id: customer?.id || null, employee_id: staff.employeeId, branch_id: branchId || null, items: cart.map((line) => ({ product_id: line.product.id, product_name: line.product.name, sku: line.product.sku || "", quantity: line.quantity, unit_price: n(line.product.price), tax_rate: n(line.product.tax_rate) })), discount_amount: can(staff, "pos_discounts") ? discountAmount : 0, notes: notes || null }) });
      if (recalledHoldId) await operationsRequest(`transactions/${encodeURIComponent(recalledHoldId)}/hold`, { method: "DELETE" }).catch(() => undefined);
      setCart([]); setCustomer(null); setDiscount("0"); setNotes(""); setRecalledHoldId(null); setMessage(`Sale held as ${result.transaction_number || "held order"}.`); await loadHeld();
    } catch (cause) { setError((cause as OperationsApiError).message || "Sale could not be held."); }
    finally { setBusy(false); }
  }

  async function recallHold(row: Row) {
    setBusy(true); setError("");
    try {
      const detail = await operationsRequest<Row>(`transactions/${encodeURIComponent(String(row.id))}`);
      const items = Array.isArray(detail.items) ? detail.items : [];
      const productRows = await Promise.all(items.map(async (item: Row) => {
        const found = await operationsRequest<Product[]>(`inventory?branch_id=${encodeURIComponent(branchId)}&active=1&search=${encodeURIComponent(String(item.sku || item.product_name || ""))}`);
        return { item, product: (Array.isArray(found) ? found : []).find((p) => String(p.id) === String(item.product_id)) };
      }));
      const missing = productRows.filter((entry) => !entry.product);
      if (missing.length) throw new Error("One or more held products are no longer available in the branch catalog.");
      setCart(productRows.map(({ item, product }) => ({ product: product!, quantity: Math.max(1, n(item.quantity)) })));
      setDiscount(String(n(detail.discount_amount)));
      setNotes(String(detail.notes || ""));
      setRecalledHoldId(String(detail.id));
      if (detail.customer_id) {
        const selected = await operationsRequest<Customer>(`customers/${encodeURIComponent(String(detail.customer_id))}`);
        setCustomer(selected);
      } else setCustomer(null);
      setMessage(`Recalled ${detail.transaction_number || "held sale"}. The hold remains preserved until checkout succeeds.`);
    } catch (cause) { setError((cause as Error).message || "Held sale could not be recalled."); }
    finally { setBusy(false); }
  }

  async function checkout() {
    if (!cart.length || busy) return;
    if (!drawerSession) return setError("Open a cash drawer session before completing a POS sale.");
    if (split && Math.abs(splitSum - total) > 0.01) return setError(`Split tenders must total exactly ${money(total)}.`);
    if (paymentMethod === "credit" && (!customer || customer.customer_type !== "credit" || customer.account_blocked)) return setError("Charge Account requires an eligible, unblocked credit customer.");
    if (!split && paymentMethod !== "credit" && n(amountTendered || total) + 0.001 < total) return setError("Amount tendered cannot be less than the sale total.");

    setBusy(true); setError(""); setMessage("");
    try {
      const payload: Row = {
        customer_id: customer?.id || null,
        employee_id: staff.employeeId,
        branch_id: branchId || null,
        drawer_session_id: drawerSession.id,
        items: cart.map((line) => ({ product_id: line.product.id, quantity: line.quantity })),
        discount_amount: can(staff, "pos_discounts") ? discountAmount : 0,
        notes: notes || null,
      };
      if (split) payload.tenders = tenders.map((tender) => ({ method: tender.method, amount: n(tender.amount), approval_code: tender.approval_code || null }));
      else { payload.payment_method = paymentMethod; payload.amount_tendered = paymentMethod === "credit" ? 0 : n(amountTendered || total); payload.approval_code = approvalCode || null; }
      const sale = await operationsRequest<Sale>("transactions", { method: "POST", body: JSON.stringify(payload) });
      let holdWarning = "";
      if (recalledHoldId) {
        try { await operationsRequest(`transactions/${encodeURIComponent(recalledHoldId)}/hold`, { method: "DELETE" }); }
        catch { holdWarning = " The original held record could not be cleared automatically; review held sales."; }
      }
      setLastSale(sale); setCart([]); setCustomer(null); setDiscount("0"); setNotes(""); setAmountTendered(""); setApprovalCode(""); setRecalledHoldId(null); setMessage(`Sale ${sale.transaction_number || "completed"} completed.${holdWarning}`); await loadHeld();
    } catch (cause) { setError((cause as OperationsApiError).message || "Checkout failed."); }
    finally { setBusy(false); }
  }

  return <section className="sc-pos" data-guide-id="pos-checkout-workspace">
    <div className="sc-pos__statusbar">
      <div><ShoppingCart size={18}/><span>Modern POS Checkout</span><strong>{branchId ? staff.defaultBranchName || `Branch ${branchId}` : "Branch required"}</strong></div>
      <div className={drawerSession ? "is-open" : "is-closed"}><WalletCards size={17}/><span>Drawer</span><strong>{drawerSession ? `${drawerSession.drawer_name || `Session ${drawerSession.id}`} · Open` : "Not open"}</strong><button type="button" onClick={() => void loadDrawer()}><RefreshCw size={14}/></button></div>
    </div>

    {error ? <div className="sc-pos__notice is-error" role="alert">{error}</div> : null}
    {message ? <div className="sc-pos__notice is-success"><CheckCircle2 size={16}/>{message}</div> : null}

    {!drawerSession ? <form className="sc-pos__drawer-open" onSubmit={openDrawer} data-guide-id="pos-open-drawer">
      <div><WalletCards size={21}/><div><strong>Open your drawer session</strong><span>Checkout stays locked until the cashier has an active drawer session.</span></div></div>
      <label>Drawer<select value={drawerId} onChange={(e) => setDrawerId(e.target.value)} required>{drawers.map((drawer) => <option key={String(drawer.id)} value={String(drawer.id)}>{drawer.name}{drawer.active_employee_name ? ` · ${drawer.active_employee_name}` : ""}</option>)}</select></label>
      <label>Opening float<input type="number" min="0" step="0.01" value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} /></label>
      <button className="sc-button sc-button--primary" type="submit" disabled={drawerBusy || !drawerId}><Banknote size={16}/>{drawerBusy ? "Opening…" : "Open drawer"}</button>
    </form> : null}

    <div className="sc-pos__layout">
      <div className="sc-pos__catalog">
        <form className="sc-pos__search" onSubmit={searchProducts} data-guide-id="pos-product-search"><Search size={18}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Scan barcode or search product / SKU" autoFocus/><button type="submit" disabled={searching}>{searching ? "Searching…" : "Search"}</button></form>
        {products.length ? <div className="sc-pos__results">{products.map((product) => <button type="button" key={String(product.id)} onClick={() => addProduct(product)} disabled={!Number(product.is_service || 0) && !Number(product.is_non_inventory || 0) && n(product.stock_qty) <= 0}><div><strong>{product.name}</strong><span>{product.sku || "No SKU"}{product.barcode ? ` · ${product.barcode}` : ""}</span></div><div><strong>{money(n(product.price))}</strong><span>{Number(product.is_service || 0) ? "Service" : `${n(product.stock_qty)} in stock`}</span>{Number(product.has_variations || 0) ? <em>Variation</em> : null}</div></button>)}</div> : <div className="sc-pos__catalog-empty"><PackageSearch size={28}/><strong>Ready to scan</strong><p>Search by product name, SKU or barcode. Branch pricing and stock come directly from the POS.</p></div>}

        {can(staff, "pos_hold") && held.length ? <section className="sc-pos__held"><header><div><PauseCircle size={17}/><strong>Held sales</strong></div><span>{held.length}</span></header>{held.map((row) => <button type="button" key={String(row.id)} onClick={() => void recallHold(row)}><div><strong>{row.transaction_number || `Hold ${row.id}`}</strong><span>{row.customer_name || "Walk-in"} · {row.created_at ? new Date(row.created_at).toLocaleString() : ""}</span></div><strong>{money(n(row.total))}</strong></button>)}</section> : null}
      </div>

      <aside className="sc-pos__cart">
        <div className="sc-pos__customer"><div><UserRound size={17}/><div><span>Customer</span><strong>{customerName(customer)}</strong></div></div><button type="button" onClick={() => setCustomerOpen((v) => !v)}>{customer ? "Change" : "Find customer"}</button></div>
        {customerOpen ? <form className="sc-pos__customer-picker" onSubmit={searchCustomers}><div><Search size={15}/><input value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} placeholder="Name, phone, email or customer #"/><button type="submit">Find</button></div>{customers.map((row) => <button type="button" key={String(row.id)} onClick={() => { setCustomer(row); setCustomerOpen(false); setCustomers([]); }}><strong>{customerName(row)}</strong><span>{row.customer_number || ""}{row.phone ? ` · ${row.phone}` : ""}{row.customer_type === "credit" ? ` · Charge account${row.account_blocked ? " blocked" : ""}` : ""}</span></button>)}{customer ? <button type="button" className="is-clear" onClick={() => { setCustomer(null); setCustomerOpen(false); }}>Use walk-in customer</button> : null}</form> : null}

        <div className="sc-pos__cart-lines" data-guide-id="pos-cart">
          {!cart.length ? <div className="sc-pos__empty-cart"><ShoppingCart size={26}/><strong>Cart is empty</strong><span>Scan or select an item to start the sale.</span></div> : cart.map((line) => <article key={String(line.product.id)}><div><strong>{line.product.name}</strong><span>{line.product.sku || ""} · {money(n(line.product.price))} each</span></div><div className="sc-pos__qty"><button type="button" onClick={() => setQuantity(line.product.id, line.quantity - 1)}><Minus size={14}/></button><strong>{line.quantity}</strong><button type="button" onClick={() => setQuantity(line.product.id, line.quantity + 1)}><Plus size={14}/></button></div><strong>{money(n(line.product.price) * line.quantity)}</strong></article>)}
        </div>

        <div className="sc-pos__totals"><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><div><span>Tax</span><strong>{money(tax)}</strong></div>{can(staff, "pos_discounts") ? <label><span>Discount</span><input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)}/></label> : null}<div className="is-total"><span>Total</span><strong>{money(total)}</strong></div></div>

        <div className="sc-pos__payment" data-guide-id="pos-payment">
          <label className="sc-pos__split-toggle"><input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)}/><span>Split payment</span></label>
          {!split ? <><label>Payment method<select value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value); setAmountTendered(""); }}><option value="cash">Cash</option><option value="card">Card</option><option value="check">Check</option><option value="gift_card">Gift card</option><option value="direct_deposit">Direct deposit</option><option value="credit">Charge account</option></select></label>{paymentMethod !== "credit" ? <label>Amount tendered<input type="number" min="0" step="0.01" value={amountTendered} placeholder={total.toFixed(2)} onChange={(e) => setAmountTendered(e.target.value)}/></label> : null}{["card","direct_deposit"].includes(paymentMethod) ? <label>Approval/reference code<input value={approvalCode} onChange={(e) => setApprovalCode(e.target.value)} placeholder="Optional reference"/></label> : null}{paymentMethod !== "credit" ? <div className="sc-pos__change"><span>Change</span><strong>{money(change)}</strong></div> : null}</> : <div className="sc-pos__split">{tenders.map((tender, index) => <div key={index}><select value={tender.method} onChange={(e) => setTenders((rows) => rows.map((row, i) => i === index ? { ...row, method: e.target.value } : row))}><option value="cash">Cash</option><option value="card">Card</option><option value="check">Check</option><option value="gift_card">Gift card</option><option value="direct_deposit">Direct deposit</option></select><input type="number" min="0" step="0.01" value={tender.amount} placeholder="Amount" onChange={(e) => setTenders((rows) => rows.map((row, i) => i === index ? { ...row, amount: e.target.value } : row))}/><input value={tender.approval_code} placeholder="Ref / approval" onChange={(e) => setTenders((rows) => rows.map((row, i) => i === index ? { ...row, approval_code: e.target.value } : row))}/></div>)}<button type="button" onClick={() => setTenders((rows) => [...rows, { method: "cash", amount: "", approval_code: "" }])}>+ Add payment leg</button><p className={Math.abs(splitSum-total)<=.01 ? "is-balanced" : ""}>{money(splitSum)} of {money(total)}</p></div>}
          <label>Sale note<textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional internal note"/></label>
        </div>

        <div className="sc-pos__actions">{can(staff, "pos_hold") ? <button type="button" className="sc-button sc-button--secondary" onClick={() => void holdSale()} disabled={!cart.length || busy}><PauseCircle size={17}/>Hold</button> : null}<button type="button" className="sc-button sc-button--primary" onClick={() => void checkout()} disabled={!cart.length || busy || !drawerSession}><CreditCard size={17}/>{busy ? "Processing…" : `Pay ${money(total)}`}</button></div>
      </aside>
    </div>

    {lastSale ? <section className="sc-pos__receipt"><div><ReceiptText size={20}/><div><span>Completed sale</span><strong>{lastSale.transaction_number || `Transaction ${lastSale.id}`}</strong></div></div><div><span>Payment</span><strong>{String(lastSale.payment_method || paymentMethod).replace(/_/g," ")}</strong></div><div><span>Total</span><strong>{money(n(lastSale.total))}</strong></div><div><span>Change</span><strong>{money(n(lastSale.change_amount))}</strong></div></section> : null}
  </section>;
}
