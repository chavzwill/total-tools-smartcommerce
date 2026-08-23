import { AlertCircle, CheckCircle2, Clock3, PackageCheck, RefreshCw, ShoppingBag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { routeHref } from "../../lib/router";
import "../../styles/account-connected-orders.css";

type Outcome = {
  intakeId: string;
  itemType: string;
  sourceChannel?: string;
  resource: string;
  reference?: string | null;
  status?: string | null;
  fulfillmentStatus?: string | null;
  snapshot?: Record<string, any>;
  lastSyncedAt?: string | null;
  syncWarning?: string;
};

function title(value: unknown) {
  return String(value || "Pending").replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function money(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD" }).format(number) : null;
}
function dateTime(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-JM", { dateStyle: "medium", timeStyle: "short" }).format(date) : null;
}
function isTerminal(status: string) {
  return ["completed", "paid", "fulfilled", "delivered", "returned", "converted"].includes(status);
}
function isProblem(status: string) {
  return ["cancelled", "canceled", "void", "voided", "refunded", "declined", "failed", "not_found"].includes(status);
}

export default function AccountConnectedOrdersPanel() {
  const [rows, setRows] = useState<Outcome[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  async function load(refresh = true) {
    refresh ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/omnichannel-outcomes?refresh=${refresh ? "1" : "0"}&limit=100`, { credentials: "same-origin", headers: { Accept: "application/json" } });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message || "Connected order activity is temporarily unavailable.");
      setRows(Array.isArray(payload?.outcomes) ? payload.outcomes : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Connected order activity is temporarily unavailable.");
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }

  useEffect(() => { void load(true); }, []);

  const orders = useMemo(() => rows.filter((row) => ["transactions", "quotations"].includes(row.resource)), [rows]);

  if (loading) return <div className="sc-connected-orders__state"><RefreshCw size={22} className="is-spinning" /><strong>Syncing your order activity…</strong><span>Checking the latest Total Tools status.</span></div>;
  if (error) return <div className="sc-connected-orders__state sc-connected-orders__state--error"><AlertCircle size={22} /><strong>Order activity could not be refreshed</strong><span>{error}</span><button type="button" onClick={() => void load(true)}>Try again</button></div>;

  return <div className="sc-connected-orders">
    <div className="sc-connected-orders__toolbar">
      <div><strong>Connected activity</strong><span>Authoritative status synchronized from Total Tools operations.</span></div>
      <button type="button" disabled={refreshing} onClick={() => void load(true)}><RefreshCw size={16} className={refreshing ? "is-spinning" : ""} />{refreshing ? "Refreshing…" : "Refresh"}</button>
    </div>

    {!orders.length ? <div className="sc-connected-orders__state"><PackageCheck size={25} /><strong>No connected orders yet</strong><span>Orders and quotations linked through SmartCommerce will appear here after they enter Total Tools operations.</span><a href={routeHref("/products")}><ShoppingBag size={16} /> Continue shopping</a></div> : <div className="sc-connected-orders__list">
      {orders.map((row) => {
        const status = String(row.status || "pending").toLowerCase();
        const fulfillment = String(row.fulfillmentStatus || "").toLowerCase();
        const total = money(row.snapshot?.total);
        const synced = dateTime(row.lastSyncedAt);
        const Icon = isProblem(status) ? AlertCircle : isTerminal(status) ? CheckCircle2 : Clock3;
        return <article className="sc-connected-order" key={row.intakeId}>
          <div className={`sc-connected-order__icon ${isProblem(status) ? "is-problem" : isTerminal(status) ? "is-complete" : ""}`}><Icon size={18} /></div>
          <div className="sc-connected-order__main">
            <div className="sc-connected-order__top"><div><span>{row.resource === "quotations" ? "Quotation" : "Order"}</span><h3>{row.reference || row.snapshot?.reference || "Connected activity"}</h3></div><span className={`sc-connected-order__status ${isProblem(status) ? "is-problem" : isTerminal(status) ? "is-complete" : ""}`}>{title(status)}</span></div>
            <div className="sc-connected-order__meta">
              {fulfillment ? <span>Fulfilment: <strong>{title(fulfillment)}</strong></span> : null}
              {total ? <span>Total: <strong>{total}</strong></span> : null}
              {row.snapshot?.paymentMethod ? <span>Payment: <strong>{title(row.snapshot.paymentMethod)}</strong></span> : null}
              {row.sourceChannel ? <span>Source: <strong>{title(row.sourceChannel)}</strong></span> : null}
              {synced ? <span>Synced: <strong>{synced}</strong></span> : null}
            </div>
            {row.syncWarning ? <p className="sc-connected-order__warning"><AlertCircle size={14} />{row.syncWarning}</p> : null}
          </div>
        </article>;
      })}
    </div>}
  </div>;
}
