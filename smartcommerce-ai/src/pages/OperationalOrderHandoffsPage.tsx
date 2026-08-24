import { useEffect, useState } from "react";
import { fetchOperationalOrderHandoffs, type OperationalOrderHandoff } from "../services/operationalOrderHandoffClient";

function money(minor: number | string, currency: string) {
  return new Intl.NumberFormat("en-JM", { style: "currency", currency: currency || "JMD" }).format(Number(minor || 0) / 100);
}
function statusLabel(value: string) { return value.replaceAll("_", " "); }

export default function OperationalOrderHandoffsPage() {
  const [orders, setOrders] = useState<OperationalOrderHandoff[]>([]);
  const [summary, setSummary] = useState({ total: 0, pendingPos: 0, pendingOperations: 0, internalInventoryCommitments: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try { const data = await fetchOperationalOrderHandoffs(); setOrders(data.orders || []); setSummary(data.summary); }
    catch (e:any) { setError(e?.message || "Operational handoffs are unavailable."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  return <section className="sc-ops-page sc-order-handoff-page">
    <header className="sc-ops-heading">
      <div><p className="sc-eyebrow">Operations integrity</p><h1>Order handoffs</h1><p>Verified payments become operational orders exactly once. Internal commitments stay visible until the POS/provider acknowledges them.</p></div>
      <button type="button" className="sc-secondary-button" onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
    </header>

    <div className="sc-metric-grid">
      <article><span>Total orders</span><strong>{summary.total}</strong></article>
      <article><span>Pending POS</span><strong>{summary.pendingPos}</strong></article>
      <article><span>Operations pending</span><strong>{summary.pendingOperations}</strong></article>
      <article><span>Internal stock holds</span><strong>{summary.internalInventoryCommitments}</strong></article>
    </div>

    <div className="sc-integrity-note"><strong>No fake acknowledgements.</strong><span>“Committed internally” means SmartCommerce is holding inventory intent. It does not mean the POS has deducted stock until provider evidence arrives.</span></div>
    {error ? <div className="sc-inline-error" role="alert">{error}</div> : null}
    {!loading && !orders.length && !error ? <div className="sc-empty-state"><h2>No operational handoffs yet</h2><p>Confirmed online payments will appear here automatically.</p></div> : null}
    <div className="sc-ops-list">
      {orders.map((order) => <article className="sc-ops-row" key={order.id}>
        <div className="sc-ops-row-main"><div><span className="sc-kicker">{order.subject_kind === "guest" ? "Guest order" : "Customer order"}</span><h2>{order.tracking_reference}</h2></div><strong>{money(order.amount_minor, order.currency)}</strong></div>
        <div className="sc-ops-row-meta">
          <span>Fulfilment <b>{statusLabel(order.fulfilment_mode)}</b></span>
          <span>POS <b>{statusLabel(order.pos_handoff_status)}</b></span>
          <span>Inventory <b>{statusLabel(order.inventory_commitment_status)}</b></span>
          <span>Lines <b>{Number(order.commitment_lines || 0)}</b></span>
          <span>Pending handoffs <b>{Number(order.pending_handoffs || 0)}</b></span>
        </div>
      </article>)}
    </div>
  </section>;
}
