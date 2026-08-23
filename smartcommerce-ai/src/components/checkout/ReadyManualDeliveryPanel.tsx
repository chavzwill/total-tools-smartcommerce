import { CheckCircle2, Loader2, RefreshCw, ShieldCheck, Truck } from "lucide-react";
import { useEffect, useState } from "react";
import { attachReadyManualDeliveryReview, listReadyManualDeliveryReviews, type ReadyManualDeliveryReview } from "../../services/manualDeliveryReadyClient";

type Props = {
  quoteId: string;
  currency: string;
  onAttached: (result: { fulfilment: any; quote: { id: string; deliveryMinor: number; totalMinor: number } }) => void;
};

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-JM", { style: "currency", currency }).format(value / 100);
}

export default function ReadyManualDeliveryPanel({ quoteId, currency, onAttached }: Props) {
  const [reviews, setReviews] = useState<ReadyManualDeliveryReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [attachingId, setAttachingId] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const result = await listReadyManualDeliveryReviews(quoteId);
      setReviews(result.reviews || []);
    } catch (err: any) {
      if (err?.status === 401) {
        setReviews([]);
      } else {
        setError(err?.message || "Reviewed delivery pricing could not be checked.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, [quoteId]);

  async function attach(review: ReadyManualDeliveryReview) {
    setAttachingId(review.id);
    setError("");
    try {
      const result = await attachReadyManualDeliveryReview(quoteId, review.id);
      onAttached(result);
      setReviews([]);
    } catch (err: any) {
      setError(err?.message || "The reviewed delivery price could not be attached.");
      if (err?.code === "DELIVERY_REVIEW_CART_CHANGED" || err?.code === "CHECKOUT_QUOTE_EXPIRED") await refresh();
    } finally {
      setAttachingId("");
    }
  }

  if (loading) return <div className="sc-fulfilment__status"><Loader2 size={18} className="sc-spin" /><span>Checking for a completed logistics review…</span></div>;
  if (!reviews.length && !error) return null;

  return <div className="sc-manual-delivery-ready">
    {reviews.length ? <div className="sc-manual-delivery-ready__head"><ShieldCheck size={18} /><div><strong>Staff-reviewed delivery is ready.</strong><span>Your merchandise was just revalidated. Attach the reviewed transport price only if this cart still matches the shipment our logistics team priced.</span></div></div> : null}
    {reviews.map((review) => <div className="sc-manual-delivery-ready__option" key={review.id}>
      <div><strong>{review.vehicleClass || review.providerName || "Reviewed delivery"}</strong><span>{review.providerName || "Total Tools logistics"}{review.scheduledFor ? ` · proposed ${new Date(review.scheduledFor).toLocaleString()}` : ""}</span>{review.staffNotes ? <small>{review.staffNotes}</small> : null}</div>
      <div className="sc-manual-delivery-ready__price"><strong>{money(review.customerChargeMinor, review.currency || currency)}</strong><span>Reviewed transport charge</span></div>
      <button type="button" onClick={() => void attach(review)} disabled={Boolean(attachingId)}>{attachingId === review.id ? <><Loader2 size={16} className="sc-spin" /> Attaching…</> : <><Truck size={16} /> Attach reviewed delivery</>}</button>
    </div>)}
    {error ? <div className="sc-fulfilment__manual"><strong>Reviewed delivery was not attached.</strong><span>{error}</span><button type="button" onClick={() => void refresh()}><RefreshCw size={15} /> Check again</button></div> : null}
    {reviews.length ? <div className="sc-fulfilment__cost-note"><CheckCircle2 size={16} /><span>SmartCommerce will reject this reviewed price if the customer, currency, cart items, quantities, or fresh quote no longer match.</span></div> : null}
  </div>;
}
