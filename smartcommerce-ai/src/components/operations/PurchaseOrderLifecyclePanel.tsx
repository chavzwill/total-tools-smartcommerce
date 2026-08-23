import { Ban, Copy, FilePenLine, RefreshCw, Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getStaffSession, operationsRequest, type OperationsApiError, type StaffIdentity } from "../../lib/staffOperations";
import "../../styles/purchase-order-lifecycle.css";

type Row = Record<string, any>;
type Mode = "copy" | "revise" | null;
type EditLine = { product_id: string; product_name: string; sku: string; quantity_ordered: number; unit_cost: number; quantity_received: number };
type Draft = { supplier_id: string; branch_id: string; expected_date: string; notes: string; items: EditLine[] };

const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const money = (value: number) => new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", maximumFractionDigits: 2 }).format(value || 0);
const pretty = (value: unknown) => String(value || "—").replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

function toDraft(po: Row): Draft {
  return {
    supplier_id: String(po.supplier_id || ""),
    branch_id: String(po.branch_id || ""),
    expected_date: po.expected_date ? String(po.expected_date).slice(0, 10) : "",
    notes: String(po.notes || ""),
    items: (Array.isArray(po.items) ? po.items : []).map((item: Row) => ({
      product_id: String(item.product_id || ""),
      product_name: String(item.product_name || item.name || item.sku || "Item"),
      sku: String(item.sku || ""),
      quantity_ordered: Math.max(1, Math.floor(n(item.quantity_ordered || item.quantity || 1))),
      unit_cost: Math.max(0, n(item.unit_cost)),
      quantity_received: Math.max(0, n(item.quantity_received)),
    })),
  };
}

export default function PurchaseOrderLifecyclePanel() {
  const [orders, setOrders] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [staff, setStaff] = useState<StaffIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<Mode>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const canCreate = Boolean(staff?.permissions?.purchasing_create);
  const status = String(selected?.status || "").toLowerCase();
  const immutable = ["received", "cancelled", "closed"].includes(status);
  const partiallyReceived = status === "partial" || (Array.isArray(selected?.items) && selected!.items.some((item: Row) => n(item.quantity_received) > 0));
  const canRevise = canCreate && Boolean(selected) && !immutable && !partiallyReceived;
  const canCopy = canCreate && Boolean(selected);
  const canCancel = canCreate && Boolean(selected) && !["received", "cancelled", "closed"].includes(status);

  async function load(selectId?: string) {
    setLoading(true); setError("");
    try {
      const [rows, session] = await Promise.all([
        operationsRequest<Row[]>("purchase-orders?limit=200"),
        getStaffSession(),
      ]);
      const list = Array.isArray(rows) ? rows : [];
      setOrders(list);
      setStaff(session.staff);
      const id = selectId || String(selected?.id || "");
      if (id) {
        const found = list.find((row) => String(row.id) === id);
        if (found) await open(found);
      }
    } catch (cause) {
      const e = cause as OperationsApiError;
      setError(e.message || "Purchase orders could not be loaded.");
    } finally { setLoading(false); }
  }

  async function open(row: Row) {
    setError(""); setNotice(""); setMode(null); setDraft(null);
    try {
      const detail = await operationsRequest<Row>(`purchase-orders/${encodeURIComponent(String(row.id))}`);
      setSelected(detail);
    } catch (cause) {
      setError((cause as OperationsApiError).message || "Purchase order details could not be loaded.");
    }
  }

  useEffect(() => { void load(); }, []);

  function begin(nextMode: Exclude<Mode, null>) {
    if (!selected) return;
    setMode(nextMode);
    setDraft(toDraft(selected));
    setError(""); setNotice("");
  }

  function updateLine(index: number, patch: Partial<EditLine>) {
    setDraft((current) => current ? { ...current, items: current.items.map((item, i) => i === index ? { ...item, ...patch } : item) } : current);
  }

  async function createReplacement() {
    if (!selected || !draft || !mode) return;
    if (!draft.supplier_id || !draft.branch_id || !draft.items.length) {
      setError("Supplier, branch, and at least one item are required."); return;
    }
    if (draft.items.some((item) => !item.product_id || !item.sku || item.quantity_ordered <= 0)) {
      setError("Every line needs its original product identity, SKU, and a quantity above zero."); return;
    }
    setBusy(mode); setError(""); setNotice("");
    try {
      const replacement = await operationsRequest<Row>("purchase-orders", {
        method: "POST",
        body: JSON.stringify({
          supplier_id: draft.supplier_id,
          branch_id: draft.branch_id,
          employee_id: staff?.employeeId || selected.employee_id || null,
          expected_date: draft.expected_date || null,
          notes: `${draft.notes}${draft.notes ? "\n" : ""}${mode === "revise" ? `Revision of ${selected.po_number || `PO ${selected.id}`}` : `Copied from ${selected.po_number || `PO ${selected.id}`}`}.`,
          items: draft.items.map((item) => ({
            product_id: item.product_id,
            product_name: item.product_name,
            sku: item.sku,
            quantity_ordered: item.quantity_ordered,
            unit_cost: item.unit_cost,
          })),
        }),
      });

      if (mode === "revise") {
        try {
          await operationsRequest(`purchase-orders/${encodeURIComponent(String(selected.id))}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status: "cancelled" }),
          });
        } catch (cancelCause) {
          setNotice(`${replacement.po_number || "The replacement PO"} was created, but the original could not be cancelled automatically. Cancel the original manually before using the replacement.`);
          setMode(null); setDraft(null); await load(String(replacement.id)); return;
        }
      }
      setNotice(`${replacement.po_number || "New purchase order"} created as a draft${mode === "revise" ? "; the original was cancelled" : ""}.`);
      setMode(null); setDraft(null); await load(String(replacement.id));
    } catch (cause) {
      const e = cause as OperationsApiError;
      setError(e.status === 403 ? "Your security group does not allow purchase-order creation." : e.message || "The new purchase order could not be created.");
    } finally { setBusy(""); }
  }

  async function cancelSelected() {
    if (!selected || !canCancel) return;
    const warning = partiallyReceived
      ? "Cancel the remaining unreceived balance of this partially received PO? Already received stock will remain in inventory."
      : `Cancel ${selected.po_number || `PO ${selected.id}`}? This preserves the record and prevents further receiving.`;
    if (!window.confirm(warning)) return;
    setBusy("cancel"); setError(""); setNotice("");
    try {
      await operationsRequest(`purchase-orders/${encodeURIComponent(String(selected.id))}/status`, { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) });
      setNotice(`${selected.po_number || "Purchase order"} cancelled. The historical record was preserved.`);
      await load(String(selected.id));
    } catch (cause) {
      const e = cause as OperationsApiError;
      setError(e.status === 403 ? "Your security group does not allow this cancellation." : e.message || "The purchase order could not be cancelled.");
    } finally { setBusy(""); }
  }

  const draftTotal = useMemo(() => draft?.items.reduce((sum, item) => sum + item.quantity_ordered * item.unit_cost, 0) || 0, [draft]);

  return <section className="sc-po-lifecycle" data-guide-id="purchase-order-lifecycle">
    <div className="sc-po-lifecycle__heading">
      <div><strong>Purchase Order Control</strong><span>Edit safely through revision, cancel without deleting history, or reuse any PO as a new draft.</span></div>
      <button type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/>{loading ? "Refreshing…" : "Refresh"}</button>
    </div>
    {error ? <div className="sc-ops-empty is-error"><strong>Purchase order action failed</strong><p>{error}</p></div> : null}
    {notice ? <div className="sc-po-lifecycle__notice">{notice}</div> : null}

    <div className="sc-po-lifecycle__layout">
      <aside className="sc-po-lifecycle__orders">
        {orders.map((po) => <button key={String(po.id)} type="button" className={String(selected?.id) === String(po.id) ? "is-active" : ""} onClick={() => void open(po)}>
          <div><strong>{po.po_number || `PO ${po.id}`}</strong><span>{po.supplier_name || "Supplier"}</span></div>
          <div><em className={`is-${String(po.status || "unknown")}`}>{pretty(po.status)}</em><span>{po.branch_name || ""}</span></div>
        </button>)}
      </aside>

      <div className="sc-po-lifecycle__detail">
        {!selected ? <div className="sc-ops-empty"><strong>Select a purchase order</strong><p>Choose a PO to inspect, revise, copy, or cancel it.</p></div> : <>
          <header>
            <div><span>{selected.po_number || `PO ${selected.id}`}</span><strong>{selected.supplier_name || "Supplier"}</strong><small>{selected.branch_name || ""} · {pretty(selected.status)}</small></div>
            <div className="sc-po-lifecycle__actions">
              <button type="button" onClick={() => begin("revise")} disabled={!canRevise || Boolean(busy)} title={partiallyReceived ? "Partially received POs cannot be revised; copy or cancel the remaining balance instead." : undefined}><FilePenLine size={15}/>Revise</button>
              <button type="button" onClick={() => begin("copy")} disabled={!canCopy || Boolean(busy)}><Copy size={15}/>Copy as new</button>
              <button type="button" className="is-danger" onClick={() => void cancelSelected()} disabled={!canCancel || Boolean(busy)}><Ban size={15}/>{busy === "cancel" ? "Cancelling…" : partiallyReceived ? "Cancel remainder" : "Cancel PO"}</button>
            </div>
          </header>
          {!mode ? <div className="sc-po-lifecycle__read">
            <div className="sc-po-lifecycle__meta"><div><small>Expected</small><strong>{selected.expected_date ? String(selected.expected_date).slice(0,10) : "Not set"}</strong></div><div><small>Total</small><strong>{money(n(selected.total))}</strong></div><div><small>Notes</small><strong>{selected.notes || "—"}</strong></div></div>
            <div className="sc-po-lifecycle__lines">{(Array.isArray(selected.items) ? selected.items : []).map((item: Row) => <div key={String(item.id || item.sku)}><div><strong>{item.product_name || item.sku}</strong><span>{item.sku}</span></div><div><small>Ordered</small><strong>{n(item.quantity_ordered)}</strong></div><div><small>Received</small><strong>{n(item.quantity_received)}</strong></div><div><small>Unit cost</small><strong>{money(n(item.unit_cost))}</strong></div></div>)}</div>
          </div> : draft ? <div className="sc-po-lifecycle__editor">
            <div className="sc-po-lifecycle__editor-head"><div><strong>{mode === "revise" ? "Revise purchase order" : "Copy to a new purchase order"}</strong><span>{mode === "revise" ? "A replacement draft is created first; the original is cancelled only after creation succeeds." : "The original remains unchanged. A fresh PO number will be generated."}</span></div><button type="button" onClick={() => { setMode(null); setDraft(null); }}><X size={15}/>Close</button></div>
            <div className="sc-po-lifecycle__fields">
              <label><span>Supplier ID</span><input value={draft.supplier_id} onChange={(e) => setDraft({ ...draft, supplier_id: e.target.value })}/></label>
              <label><span>Branch ID</span><input value={draft.branch_id} onChange={(e) => setDraft({ ...draft, branch_id: e.target.value })}/></label>
              <label><span>Expected date</span><input type="date" value={draft.expected_date} onChange={(e) => setDraft({ ...draft, expected_date: e.target.value })}/></label>
              <label className="is-wide"><span>Notes</span><textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })}/></label>
            </div>
            <div className="sc-po-lifecycle__edit-lines">{draft.items.map((item, index) => <div key={`${item.product_id}-${item.sku}-${index}`}><div><strong>{item.product_name}</strong><span>{item.sku} · product {item.product_id}</span></div><label><span>Quantity</span><input type="number" min={1} value={item.quantity_ordered} onChange={(e) => updateLine(index, { quantity_ordered: Math.max(1, Math.floor(n(e.target.value))) })}/></label><label><span>Unit cost</span><input type="number" min={0} step="0.01" value={item.unit_cost} onChange={(e) => updateLine(index, { unit_cost: Math.max(0, n(e.target.value)) })}/></label></div>)}</div>
            <div className="sc-po-lifecycle__editor-footer"><div><small>Draft total</small><strong>{money(draftTotal)}</strong></div><button type="button" onClick={() => void createReplacement()} disabled={Boolean(busy)}><Save size={15}/>{busy ? "Creating…" : mode === "revise" ? "Create revision" : "Create copied PO"}</button></div>
          </div> : null}
          <p className="sc-po-lifecycle__policy">Received POs are immutable. A revision never overwrites history: it creates a new draft PO, then cancels the old one only after the replacement succeeds. Copying always creates a new PO number and leaves the source untouched.</p>
        </>}
      </div>
    </div>
  </section>;
}
