import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Loader2, LogOut, RefreshCw, ShieldCheck, Truck } from "lucide-react";
import Container from "../components/shared/Container";
import { getStaffSession, listDeliveryReviews, loginStaff, logoutStaff, priceDeliveryReview, type DeliveryReview, type StaffSessionSummary } from "../services/deliveryReviewClient";
import "../styles/delivery-review.css";

function moneyFromMinor(value: number | string | null | undefined, currency = "JMD") {
  const minor = Number(value || 0);
  return new Intl.NumberFormat("en-JM", { style: "currency", currency }).format(minor / 100);
}

function itemLabel(item: any) {
  const quantity = Math.max(1, Number(item?.quantity || 1));
  return `${quantity} × ${String(item?.name || item?.sku || item?.productId || "Item")}`;
}

export default function DeliveryReviewPage() {
  const [staff, setStaff] = useState<StaffSessionSummary | null>(null);
  const [checking, setChecking] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [reviews, setReviews] = useState<DeliveryReview[]>([]);
  const [status, setStatus] = useState("pending");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { providerName: string; vehicleClass: string; providerCost: string; customerCharge: string; scheduledFor: string; staffNotes: string }>>({});

  useEffect(() => {
    let active = true;
    getStaffSession()
      .then((result) => { if (active) setStaff(result.authenticated ? result.staff : null); })
      .catch(() => { if (active) setStaff(null); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);

  async function refresh(nextStatus = status) {
    if (!staff) return;
    setLoading(true);
    setError("");
    try {
      const result = await listDeliveryReviews(nextStatus);
      setReviews(result.reviews || []);
    } catch (err: any) {
      setError(err?.message || "Delivery reviews could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (staff) void refresh(status); }, [staff, status]);

  const pendingCount = useMemo(() => reviews.filter((review) => review.status === "pending").length, [reviews]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setLoginError("");
    try {
      const result = await loginStaff({ username: username.trim(), password });
      setStaff(result.staff);
      setPassword("");
    } catch (err: any) {
      setLoginError(err?.message || "Staff sign-in failed.");
    }
  }

  async function signOut() {
    await logoutStaff().catch(() => undefined);
    setStaff(null);
    setReviews([]);
  }

  function draftFor(review: DeliveryReview) {
    return drafts[review.id] || {
      providerName: review.provider_name || "",
      vehicleClass: review.vehicle_class || "",
      providerCost: review.provider_cost_minor ? (Number(review.provider_cost_minor) / 100).toFixed(2) : "",
      customerCharge: review.customer_charge_minor ? (Number(review.customer_charge_minor) / 100).toFixed(2) : "",
      scheduledFor: review.scheduled_for ? new Date(review.scheduled_for).toISOString().slice(0, 16) : "",
      staffNotes: review.staff_notes || "",
    };
  }

  function patchDraft(id: string, key: string, value: string, review: DeliveryReview) {
    setDrafts((current) => ({ ...current, [id]: { ...draftFor(review), ...(current[id] || {}), [key]: value } }));
  }

  async function save(review: DeliveryReview) {
    const draft = draftFor(review);
    const providerCostMinor = Math.round(Number(draft.providerCost || 0) * 100);
    const customerChargeMinor = Math.round(Number(draft.customerCharge || 0) * 100);
    if (!Number.isFinite(customerChargeMinor) || customerChargeMinor <= 0) {
      setError("Enter the customer delivery charge before marking a review priced.");
      return;
    }
    setSavingId(review.id);
    setError("");
    try {
      await priceDeliveryReview({
        id: review.id,
        providerName: draft.providerName.trim() || undefined,
        vehicleClass: draft.vehicleClass.trim() || undefined,
        providerCostMinor: Number.isFinite(providerCostMinor) ? Math.max(0, providerCostMinor) : 0,
        customerChargeMinor,
        currency: review.currency || "JMD",
        scheduledFor: draft.scheduledFor ? new Date(draft.scheduledFor).toISOString() : undefined,
        staffNotes: draft.staffNotes.trim() || undefined,
      });
      setDrafts((current) => { const next = { ...current }; delete next[review.id]; return next; });
      await refresh(status);
    } catch (err: any) {
      setError(err?.message || "This delivery review could not be priced.");
    } finally {
      setSavingId("");
    }
  }

  if (checking) return <div className="sc-delivery-review-page"><Container><div className="sc-delivery-review-loading"><Loader2 className="sc-spin" size={20} /> Checking staff access…</div></Container></div>;

  if (!staff) {
    return <div className="sc-delivery-review-page"><Container className="sc-delivery-review-shell"><section className="sc-delivery-review-login"><div className="sc-delivery-review-badge"><ShieldCheck size={18} /> Internal logistics</div><h1>Staff delivery review</h1><p>Sign in with your Total Tools POS staff credentials. Customer accounts cannot access this workspace.</p><form onSubmit={signIn}><label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label><label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required /></label>{loginError ? <p className="sc-delivery-review-error" role="alert">{loginError}</p> : null}<button type="submit">Sign in to logistics</button></form></section></Container></div>;
  }

  return <div className="sc-delivery-review-page"><Container className="sc-delivery-review-shell">
    <header className="sc-delivery-review-header"><div><div className="sc-delivery-review-badge"><Truck size={18} /> Manual logistics queue</div><h1>Delivery review</h1><p>Price large items, rentals and special-handling shipments without weakening merchandise-price revalidation.</p></div><div className="sc-delivery-review-user"><span>{staff.firstName || staff.username}{staff.role ? ` · ${staff.role}` : ""}</span><button type="button" onClick={signOut}><LogOut size={16} /> Sign out</button></div></header>

    <section className="sc-delivery-review-toolbar"><div className="sc-delivery-review-tabs"><button type="button" className={status === "pending" ? "is-active" : ""} onClick={() => setStatus("pending")}>Pending</button><button type="button" className={status === "priced" ? "is-active" : ""} onClick={() => setStatus("priced")}>Priced</button><button type="button" className={status === "all" ? "is-active" : ""} onClick={() => setStatus("all")}>All</button></div><button type="button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} className={loading ? "sc-spin" : ""} /> Refresh</button></section>

    {error ? <p className="sc-delivery-review-error" role="alert">{error}</p> : null}
    {!loading && !reviews.length ? <section className="sc-delivery-review-empty"><ClipboardCheck size={26} /><strong>No {status === "all" ? "delivery" : status} reviews.</strong><span>Manual delivery cases will appear here when checkout cannot safely calculate transport automatically.</span></section> : null}

    <div className="sc-delivery-review-list">
      {reviews.map((review) => {
        const draft = draftFor(review);
        const address = review.address || {};
        const priced = review.status === "priced";
        return <article key={review.id} className="sc-delivery-review-card">
          <div className="sc-delivery-review-card__head"><div><span>{review.reason_code || "MANUAL_REVIEW"}</span><strong>{address.siteName || address.label || address.city || "Delivery destination"}</strong><small>{address.line1 ? `${address.line1}, ` : ""}{address.city || ""}{address.region ? `, ${address.region}` : ""}</small></div><div className={`sc-delivery-review-status is-${review.status}`}>{review.status}</div></div>
          <div className="sc-delivery-review-meta"><span>Review {review.id}</span><span>{review.requested_speed || "standard"}</span><span>{review.destination_class || "unclassified"}</span></div>
          {review.reason_message ? <p className="sc-delivery-review-reason">{review.reason_message}</p> : null}
          <div className="sc-delivery-review-items">{Array.isArray(review.items) ? review.items.map((item, index) => <span key={`${review.id}-${index}`}>{itemLabel(item)}</span>) : null}</div>
          <div className="sc-delivery-review-recipient"><strong>{address.recipientName || "Recipient not supplied"}</strong><span>{address.phone || "No phone"}</span>{address.notes ? <small>{address.notes}</small> : null}</div>

          <div className="sc-delivery-review-form">
            <label>Transport provider<input value={draft.providerName} onChange={(event) => patchDraft(review.id, "providerName", event.target.value, review)} placeholder="Internal fleet, contractor, courier" disabled={priced} /></label>
            <label>Vehicle / handling class<input value={draft.vehicleClass} onChange={(event) => patchDraft(review.id, "vehicleClass", event.target.value, review)} placeholder="Pickup, van, 3-ton truck…" disabled={priced} /></label>
            <label>Provider / operating cost (J$)<input inputMode="decimal" value={draft.providerCost} onChange={(event) => patchDraft(review.id, "providerCost", event.target.value, review)} placeholder="0.00" disabled={priced} /></label>
            <label>Customer delivery charge (J$)<input inputMode="decimal" value={draft.customerCharge} onChange={(event) => patchDraft(review.id, "customerCharge", event.target.value, review)} placeholder="0.00" disabled={priced} /></label>
            <label>Proposed delivery time<input type="datetime-local" value={draft.scheduledFor} onChange={(event) => patchDraft(review.id, "scheduledFor", event.target.value, review)} disabled={priced} /></label>
            <label className="sc-delivery-review-form__wide">Staff notes<textarea value={draft.staffNotes} onChange={(event) => patchDraft(review.id, "staffNotes", event.target.value, review)} rows={3} placeholder="Access, loading, unloading, return collection, equipment requirements…" disabled={priced} /></label>
          </div>
          {priced ? <div className="sc-delivery-review-priced"><strong>Customer charge: {moneyFromMinor(review.customer_charge_minor, review.currency || "JMD")}</strong><span>Provider/operating cost: {moneyFromMinor(review.provider_cost_minor, review.currency || "JMD")} · Internal margin: {moneyFromMinor(review.operations_markup_minor, review.currency || "JMD")}</span><small>The customer must still revalidate merchandise before this reviewed transport price can become payable.</small></div> : <button className="sc-delivery-review-save" type="button" onClick={() => void save(review)} disabled={savingId === review.id}>{savingId === review.id ? <><Loader2 size={16} className="sc-spin" /> Saving price…</> : "Mark delivery priced"}</button>}
        </article>;
      })}
    </div>
    {pendingCount > 0 && status === "all" ? <p className="sc-delivery-review-footer-note">{pendingCount} review{pendingCount === 1 ? "" : "s"} still require pricing.</p> : null}
  </Container></div>;
}
