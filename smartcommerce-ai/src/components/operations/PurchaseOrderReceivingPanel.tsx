import { CheckCircle2, ClipboardCheck, PackageOpen, RefreshCw, Send, ShieldCheck, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getStaffSession, operationsRequest, type OperationsApiError, type StaffIdentity } from "../../lib/staffOperations";
import "../../styles/purchase-order-receiving.css";

type Row = Record<string, any>;
type QtyMap = Record<string, string>;
const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const pretty = (value: unknown) => String(value || "—").replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
const money = (value: unknown) => new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", maximumFractionDigits: 2 }).format(n(value));

function explicitCan(staff: StaffIdentity | null, key: string, parent: string) {
  if (!staff) return false;
  if (Object.prototype.hasOwnProperty.call(staff.permissions, key)) return staff.permissions[key] === true;
  return staff.permissions[parent] === true;
}

export default function PurchaseOrderReceivingPanel() {
  const [staff, setStaff] = useState<StaffIdentity | null>(null);
  const [orders, setOrders] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [quantities, setQuantities] = useState<QtyMap>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const canCreate = explicitCan(staff, "purchasing_create", "purchasing");
  const canApprove = explicitCan(staff, "purchasing_approve", "purchasing");
  const canReceive = explicitCan(staff, "purchasing_receive", "purchasing");
  const status = String(selected?.status || "").toLowerCase();
  const locked = ["received", "cancelled"].includes(status);
  const lines = Array.isArray(selected?.items) ? selected!.items : [];
  const ordered = useMemo(() => lines.reduce((sum: number, item: Row) => sum + n(item.quantity_ordered), 0), [lines]);
  const received = useMemo(() => lines.reduce((sum: number, item: Row) => sum + n(item.quantity_received), 0), [lines]);
  const remaining = Math.max(0, ordered - received);

  async function load(selectId?: string) {
    setLoading(true); setError("");
    try {
      const [rows, session] = await Promise.all([
        operationsRequest<Row[]>("purchase-orders?limit=200"),
        getStaffSession(),
      ]);
      const list = Array.isArray(rows) ? rows : [];
      setOrders(list.filter((row) => !["cancelled"].includes(String(row.status).toLowerCase())));
      setStaff(session.staff);
      const targetId = selectId || String(selected?.id || "");
      if (targetId) {
        const match = list.find((row) => String(row.id) === targetId);
        if (match) await open(match);
      }
    } catch (cause) {
      setError((cause as OperationsApiError).message || "Purchase orders could not be loaded.");
    } finally { setLoading(false); }
  }

  async function open(row: Row) {
    setError(""); setNotice(""); setQuantities({});
    try {
      const detail = await operationsRequest<Row>(`purchase-orders/${encodeURIComponent(String(row.id))}`);
      setSelected(detail);
    } catch (cause) { setError((cause as OperationsApiError).message || "Purchase order details could not be loaded."); }
  }

  useEffect(() => { void load(); }, []);

  async function changeStatus(nextStatus: "sent" | "approved" | "draft") {
    if (!selected || busy) return;
    setBusy(nextStatus); setError(""); setNotice("");
    try {
      await operationsRequest(`purchase-orders/${encodeURIComponent(String(selected.id))}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      setNotice(`${selected.po_number || "Purchase order"} marked ${pretty(nextStatus).toLowerCase()}.`);
      await load(String(selected.id));
    } catch (cause) {
      const e = cause as OperationsApiError;
      setError(e.status === 403 ? "Your security group does not allow this purchase-order transition." : e.message || "Purchase-order status could not be changed.");
    } finally { setBusy(""); }
  }

  function setQty(item: Row, raw: string) {
    const max = Math.max(0, n(item.quantity_ordered) - n(item.quantity_received));
    const qty = Math.max(0, Math.min(max, Math.floor(n(raw))));
    setQuantities((current) => ({ ...current, [String(item.id)]: qty ? String(qty) : "" }));
  }

  function receiveAllRemaining() {
    const next: QtyMap = {};
    for (const item of lines) {
      const rem = Math.max(0, n(item.quantity_ordered) - n(item.quantity_received));
      if (rem > 0) next[String(item.id)] = String(rem);
    }
    setQuantities(next);
  }

  async function receive() {
    if (!selected || !canReceive || locked || busy) return;
    const payload = lines.map((item: Row) => ({
      item_id: item.id,
      quantity_received: Math.max(0, Math.min(
        Math.max(0, n(item.quantity_ordered) - n(item.quantity_received)),
        Math.floor(n(quantities[String(item.id)])),
      )),
    })).filter((row: Row) => row.quantity_received > 0);
    if (!payload.length) { setError("Enter at least one quantity to receive."); return; }
    setBusy("receive"); setError(""); setNotice("");
    try {
      const updated = await operationsRequest<Row>(`purchase-orders/${encodeURIComponent(String(selected.id))}/receive`, {
        method: "PATCH",
        body: JSON.stringify({ items: payload }),
      });
      setNotice(`${selected.po_number || "Purchase order"} receipt posted. Status: ${pretty(updated.status)}.`);
      setQuantities({});
      await load(String(selected.id));
    } catch (cause) {
      const e = cause as OperationsApiError;
      setError(e.status === 403 ? "Your security group does not allow purchase-order receiving." : e.message || "Receipt could not be posted.");
    } finally { setBusy(""); }
  }

  return <section className="sc-po-receiving" data-guide-id="purchase-order-receiving">
    <div className="sc-po-receiving__head">
      <div><PackageOpen size={19}/><div><strong>Approval & Receiving</strong><span>Send, approve, partially receive, and close purchase orders against the live inventory ledger.</span></div></div>
      <button type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/>{loading ? "Refreshing…" : "Refresh"}</button>
    </div>
    {error ? <div className="sc-ops-empty is-error"><strong>Purchasing action failed</strong><p>{error}</p></div> : null}
    {notice ? <div className="sc-po-receiving__notice"><CheckCircle2 size={16}/>{notice}</div> : null}

    <div className="sc-po-receiving__layout">
      <aside>{orders.map((po) => <button key={String(po.id)} className={String(selected?.id) === String(po.id) ? "is-active" : ""} onClick={() => void open(po)}>
        <div><strong>{po.po_number || `PO ${po.id}`}</strong><span>{po.supplier_name || "Supplier"}</span></div>
        <div><em className={`is-${String(po.status || "unknown")}`}>{pretty(po.status)}</em><small>{po.branch_name || ""}</small></div>
      </button>)}</aside>

      <div className="sc-po-receiving__detail">
        {!selected ? <div className="sc-ops-empty"><strong>Select a purchase order</strong><p>Choose a PO to manage approval and receiving.</p></div> : <>
          <header>
            <div><span>{selected.po_number || `PO ${selected.id}`}</span><strong>{selected.supplier_name || "Supplier"}</strong><small>{selected.branch_name || ""} · Expected {selected.expected_date ? String(selected.expected_date).slice(0,10) : "not set"}</small></div>
            <em className={`is-${status}`}>{pretty(status)}</em>
          </header>

          <div className="sc-po-receiving__metrics">
            <div><span>PO value</span><strong>{money(selected.total)}</strong></div>
            <div><span>Units ordered</span><strong>{ordered}</strong></div>
            <div><span>Units received</span><strong>{received}</strong></div>
            <div><span>Units remaining</span><strong>{remaining}</strong></div>
          </div>

          <div className="sc-po-receiving__workflow">
            <button onClick={() => void changeStatus("sent")} disabled={!canCreate || locked || status === "sent" || Boolean(busy)}><Send size={15}/>{busy === "sent" ? "Updating…" : "Mark sent"}</button>
            <button onClick={() => void changeStatus("approved")} disabled={!canApprove || locked || status === "approved" || Boolean(busy)}><ShieldCheck size={15}/>{busy === "approved" ? "Approving…" : "Approve PO"}</button>
            <button onClick={() => void changeStatus("draft")} disabled={!canCreate || locked || status === "draft" || received > 0 || Boolean(busy)}><ClipboardCheck size={15}/>Return to draft</button>
          </div>

          <div className="sc-po-receiving__lines">
            <div className="sc-po-receiving__lines-head"><strong>Receiving lines</strong>{remaining > 0 && canReceive && !locked ? <button onClick={receiveAllRemaining}>Fill remaining</button> : null}</div>
            {lines.map((item: Row) => {
              const rem = Math.max(0, n(item.quantity_ordered) - n(item.quantity_received));
              return <div className={rem === 0 ? "is-complete" : ""} key={String(item.id)}>
                <div><strong>{item.product_name || item.sku || `Item ${item.id}`}</strong><span>{item.sku || "No SKU"}{!item.product_id ? " · product link required for inventory" : ""}</span></div>
                <div><small>Ordered</small><strong>{n(item.quantity_ordered)}</strong></div>
                <div><small>Received</small><strong>{n(item.quantity_received)}</strong></div>
                <div><small>Remaining</small><strong>{rem}</strong></div>
                <div><small>Unit cost</small><strong>{money(item.unit_cost)}</strong></div>
                <label><span>Receive now</span><input type="number" min="0" max={rem} step="1" disabled={!canReceive || locked || rem === 0 || Boolean(busy)} value={quantities[String(item.id)] || ""} onChange={(e) => setQty(item, e.target.value)}/></label>
              </div>;
            })}
          </div>

          {!locked && remaining > 0 ? <div className="sc-po-receiving__post">
            <div><Truck size={17}/><p><strong>Before posting a receipt</strong><span>Count what physically arrived. Enter only accepted quantities. Damage, shortages, freight, supplier invoice references, and other discrepancies should be retained in the PO's supporting documents/notes until dedicated upstream fields are added.</span></p></div>
            <button className="sc-button sc-button--primary" onClick={() => void receive()} disabled={!canReceive || Boolean(busy)}>{busy === "receive" ? "Posting receipt…" : "Post receipt"}</button>
          </div> : <div className="sc-po-receiving__closed"><CheckCircle2 size={18}/><span>{status === "received" ? "This PO has been fully received." : status === "cancelled" ? "This PO is cancelled and cannot be received." : "No units remain to receive."}</span></div>}

          <p className="sc-po-receiving__policy">Receiving writes directly to the POS inventory ledger. Partial receipts stay open; a fully received PO closes automatically and advances its originating purchase request to received. Off-catalog lines must be linked to a real product before their received quantity can land in stock.</p>
        </>}
      </div>
    </div>
  </section>;
}
