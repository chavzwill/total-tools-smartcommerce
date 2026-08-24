import { CheckCircle2, Clipboard, Link2, Loader2, PackageCheck, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getGuestOrder, getGuestOrderWithAccessToken, issueGuestReceiptLink, type GuestOrder } from "../services/guestOrderClient";

function money(minor: number, currency: string) {
  try { return new Intl.NumberFormat("en-JM", { style: "currency", currency: currency || "JMD" }).format((Number(minor) || 0) / 100); }
  catch { return `${currency || "JMD"} ${((Number(minor) || 0) / 100).toFixed(2)}`; }
}

export default function GuestOrderPage({ orderId, attemptId, accessToken }: { orderId?: string; attemptId?: string; accessToken?: string }) {
  const [order, setOrder] = useState<GuestOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [shareExpiry, setShareExpiry] = useState("");
  const [issuing, setIssuing] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const load = accessToken && orderId
      ? getGuestOrderWithAccessToken({ orderId, accessToken })
      : getGuestOrder({ orderId, attemptId });
    void load.then((value) => { if (active) setOrder(value); }).catch((reason: any) => {
      if (active) setError(reason?.message || "We could not load this guest order yet.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [orderId, attemptId, accessToken]);

  const fulfilmentLabel = useMemo(() => {
    if (!order?.fulfilment) return "Fulfilment verified";
    if (order.fulfilment.mode === "pickup") return "Pickup confirmed";
    if (order.fulfilment.collectionPoint?.name) return `Collect at ${order.fulfilment.collectionPoint.name}`;
    return order.fulfilment.serviceLabel || "Delivery confirmed";
  }, [order]);

  async function createReceiptLink() {
    if (!order || accessToken) return;
    setIssuing(true);
    setError("");
    try {
      const issued = await issueGuestReceiptLink(order.id);
      const url = new URL(window.location.href);
      url.hash = `/guest-order?order=${encodeURIComponent(order.id)}&access=${encodeURIComponent(issued.accessToken)}`;
      setShareUrl(url.toString());
      setShareExpiry(issued.expiresAt);
    } catch (reason: any) {
      setError(reason?.message || "The secure receipt link could not be created.");
    } finally {
      setIssuing(false);
    }
  }

  async function copyReceiptLink() {
    if (!shareUrl) return;
    await navigator.clipboard?.writeText(shareUrl).catch(() => undefined);
  }

  if (loading) return <main className="sc-guest-order"><div className="sc-guest-order__state"><Loader2 size={24} aria-hidden="true" /><strong>Confirming your order…</strong><span>SmartCommerce is checking verified payment and order records.</span></div></main>;
  if (!order) return <main className="sc-guest-order"><div className="sc-guest-order__state is-error"><strong>Order receipt unavailable</strong><span>{error || "This order is not available yet. If payment was just completed, try again shortly."}</span></div></main>;

  return (
    <main className="sc-guest-order">
      <section className="sc-guest-order__hero">
        <div className="sc-guest-order__success"><CheckCircle2 size={28} aria-hidden="true" /><span>Payment verified</span></div>
        <h1>Your order is confirmed.</h1>
        <p>SmartCommerce created this order only after verified payment evidence was received from the payment provider.</p>
        <div className="sc-guest-order__reference"><span>Order reference</span><strong>{order.id}</strong></div>
      </section>

      {error ? <p className="sc-guest-order__error" role="alert">{error}</p> : null}

      <section className="sc-guest-order__grid">
        <article className="sc-guest-order__card">
          <div className="sc-guest-order__card-head"><PackageCheck size={20} aria-hidden="true" /><strong>Order summary</strong></div>
          <div className="sc-guest-order__items">
            {order.items.map((item, index) => (
              <div className="sc-guest-order__item" key={`${item.productId || item.sku || index}`}>
                <div><strong>{item.name || item.sku || "Item"}</strong><span>{item.sku ? `SKU ${item.sku}` : "Verified catalogue item"}</span></div>
                <div><span>Qty {item.quantity || 1}</span>{Number.isFinite(item.unitPrice) ? <strong>{money(Math.round(Number(item.unitPrice) * 100 * Number(item.quantity || 1)), item.currency || order.currency)}</strong> : null}</div>
              </div>
            ))}
          </div>
          <div className="sc-guest-order__total"><span>Total paid</span><strong>{money(order.totalMinor, order.currency)}</strong></div>
        </article>

        <article className="sc-guest-order__card">
          <div className="sc-guest-order__card-head"><ShieldCheck size={20} aria-hidden="true" /><strong>Payment & fulfilment</strong></div>
          <dl className="sc-guest-order__facts">
            <div><dt>Status</dt><dd>Paid</dd></div>
            <div><dt>Payment provider</dt><dd>{order.provider}</dd></div>
            <div><dt>Provider reference</dt><dd>{order.providerReference}</dd></div>
            <div><dt>Fulfilment</dt><dd>{fulfilmentLabel}</dd></div>
            <div><dt>Paid</dt><dd>{new Date(order.paidAt).toLocaleString()}</dd></div>
          </dl>
        </article>
      </section>

      {!accessToken ? (
        <section className="sc-guest-order__receipt">
          <div><Link2 size={20} aria-hidden="true" /><div><strong>Save a secure receipt link</strong><span>Create a private link that works for 30 days even after this guest checkout session expires.</span></div></div>
          {!shareUrl ? <button type="button" onClick={createReceiptLink} disabled={issuing}>{issuing ? <><Loader2 size={16} aria-hidden="true" /> Creating…</> : "Create receipt link"}</button> : (
            <div className="sc-guest-order__share"><code>{shareUrl}</code><button type="button" onClick={copyReceiptLink}><Clipboard size={15} aria-hidden="true" /> Copy</button>{shareExpiry ? <small>Expires {new Date(shareExpiry).toLocaleDateString()}</small> : null}</div>
          )}
        </section>
      ) : null}
    </main>
  );
}
