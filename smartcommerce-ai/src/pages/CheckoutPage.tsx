import { BriefcaseBusiness, CheckCircle2, CreditCard, Loader2, MapPin, PackageCheck, RefreshCw, ShieldCheck, ShoppingBag, Store, Truck, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import CourierCollectionPointPicker from "../components/checkout/CourierCollectionPointPicker";
import PaymentMethodPanel from "../components/checkout/PaymentMethodPanel";
import ReadyManualDeliveryPanel from "../components/checkout/ReadyManualDeliveryPanel";
import SavedDeliveryAddressPicker from "../components/checkout/SavedDeliveryAddressPicker";
import Container from "../components/shared/Container";
import { bindCheckoutFulfilment, type BoundFulfilment, type CheckoutDeliveryAddress } from "../services/checkoutFulfilmentClient";
import { createCheckoutQuote, createGuestCheckoutQuote, type CheckoutQuote, type GuestCheckoutItem } from "../lib/customerCommerce";
import { go, routeHref } from "../lib/router";
import { listCommercialAccounts, type CommercialAccountSummary } from "../services/commercialAccountClient";
import { getDeliveryQuote, type DeliveryQuoteResult, type DeliverySpeed, type DeliveryZoneResult } from "../services/deliveryClient";
import "../styles/payment-methods.css";
import "../styles/delivery-fulfilment.css";

type SettlementMode = "standard" | "commercial-credit";
type RecoveryReason = "auth" | "provider" | "unknown";
type FulfilmentMode = "pickup" | "delivery";
type DeliveryQuoteWithZone = DeliveryQuoteResult & { zone: DeliveryZoneResult | null };

type CreditCheckoutResult = {
  order: { id: string; status: string; commercialAccountId: string; commercialAccountName: string; paymentTermsCode: string; purchaseOrderReference?: string | null; };
};
type ApiErrorPayload = { error?: { code?: string; message?: string } };

const JAMAICA_PARISHES = ["Kingston", "St. Andrew", "St. Catherine", "Clarendon", "Manchester", "St. Elizabeth", "Westmoreland", "Hanover", "St. James", "Trelawny", "St. Ann", "St. Mary", "Portland", "St. Thomas"];

function formatMinor(value: number, currency = "JMD") { return new Intl.NumberFormat("en-JM", { style: "currency", currency }).format(value / 100); }
function formatJmd(value: number) { return new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", maximumFractionDigits: 0 }).format(value); }
function isProviderValidationFailure(error: any) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  return code.includes("provider") || code.includes("validation") || code.includes("unavailable") || message.includes("provider") || message.includes("revalid") || message.includes("unavailable") || message.includes("inventory");
}

async function submitCommercialCreditCheckout(input: { quoteId: string; commercialAccountId: string; purchaseOrderReference?: string; }) {
  const response = await fetch("/api/commercial-credit-checkout", { method: "POST", credentials: "same-origin", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const payload = await response.json().catch(() => ({})) as CreditCheckoutResult & ApiErrorPayload;
  if (!response.ok) {
    const error = new Error(payload.error?.message || "Commercial credit checkout could not be completed.") as Error & { code?: string; status?: number };
    error.code = payload.error?.code; error.status = response.status; throw error;
  }
  return payload as CreditCheckoutResult;
}

const canUseCredit = (account: CommercialAccountSummary) => account.verification_status === "verified" && account.privilege_status === "enabled" && account.authority_status === "verified" && account.mapping_status === "verified" && Boolean(account.payment_terms_code) && ["owner", "admin", "buyer", "approver"].includes(account.role);

const emptyAddress: CheckoutDeliveryAddress = { type: "home", recipientName: "", phone: "", line1: "", line2: "", city: "", region: "", postalCode: "", countryCode: "JM", siteName: "", notes: "" };

export default function CheckoutPage({ guestCart }: { guestCart: GuestCheckoutItem[] }) {
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recoveryReason, setRecoveryReason] = useState<RecoveryReason>("unknown");
  const [settlementMode, setSettlementMode] = useState<SettlementMode>("standard");
  const [fulfilmentMode, setFulfilmentMode] = useState<FulfilmentMode>("pickup");
  const [deliverySpeed, setDeliverySpeed] = useState<DeliverySpeed>("standard");
  const [deliveryQuote, setDeliveryQuote] = useState<DeliveryQuoteWithZone | null>(null);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [deliveryError, setDeliveryError] = useState("");
  const [selectedDeliveryServiceId, setSelectedDeliveryServiceId] = useState("");
  const [selectedCollectionPointId, setSelectedCollectionPointId] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState<CheckoutDeliveryAddress>(emptyAddress);
  const [boundFulfilment, setBoundFulfilment] = useState<BoundFulfilment | null>(null);
  const [bindingLoading, setBindingLoading] = useState(false);
  const [bindingError, setBindingError] = useState("");
  const [commercialAccounts, setCommercialAccounts] = useState<CommercialAccountSummary[]>([]);
  const [commercialLoading, setCommercialLoading] = useState(false);
  const [selectedCommercialAccountId, setSelectedCommercialAccountId] = useState("");
  const [purchaseOrderReference, setPurchaseOrderReference] = useState("");
  const [creditSubmitting, setCreditSubmitting] = useState(false);
  const [creditError, setCreditError] = useState("");

  const prepareCheckout = useCallback(async () => {
    setLoading(true); setError(""); setRecoveryReason("unknown"); setQuote(null); setBoundFulfilment(null);
    try { setQuote(await createCheckoutQuote()); }
    catch (err: any) {
      if (err?.status === 401 && guestCart.length) {
        try { setQuote(await createGuestCheckoutQuote(guestCart)); return; }
        catch (guestError: any) { setRecoveryReason(isProviderValidationFailure(guestError) ? "provider" : "unknown"); setError(guestError?.message || "Guest checkout could not be prepared."); return; }
      }
      setRecoveryReason(err?.status === 401 ? "auth" : isProviderValidationFailure(err) ? "provider" : "unknown"); setError(err?.message || "Checkout could not be prepared.");
    } finally { setLoading(false); }
  }, [guestCart]);

  useEffect(() => { let active = true; void (async () => { if (active) await prepareCheckout(); })(); return () => { active = false; }; }, [prepareCheckout]);

  const guest = quote?.checkoutMode === "guest";
  const deliveryAddressComplete = Boolean(deliveryAddress.recipientName.trim() && deliveryAddress.phone.trim() && deliveryAddress.line1.trim() && deliveryAddress.city.trim() && deliveryAddress.region.trim());

  useEffect(() => {
    if (!quote || guest || fulfilmentMode !== "pickup") return;
    let active = true; setBindingLoading(true); setBindingError("");
    bindCheckoutFulfilment({ quoteId: quote.id, mode: "pickup" }).then((result) => { if (!active) return; setBoundFulfilment(result.fulfilment); setQuote((current) => current ? { ...current, deliveryMinor: result.quote.deliveryMinor, totalMinor: result.quote.totalMinor } : current); }).catch((err: any) => { if (active) setBindingError(err?.message || "Pickup could not be confirmed."); }).finally(() => { if (active) setBindingLoading(false); });
    return () => { active = false; };
  }, [quote?.id, guest, fulfilmentMode]);

  useEffect(() => {
    if (!quote || fulfilmentMode !== "delivery" || !deliveryAddress.city.trim() || !deliveryAddress.region.trim()) {
      setDeliveryQuote(null); setDeliveryError(""); setSelectedDeliveryServiceId(""); setSelectedCollectionPointId(""); return;
    }
    let active = true; setDeliveryLoading(true); setDeliveryError("");
    getDeliveryQuote({ items: quote.items.map((item) => ({ productId: item.productId, quantity: item.quantity, fulfilmentType: "sale" as const })), address: { city: deliveryAddress.city, region: deliveryAddress.region, countryCode: "JM" }, requestedSpeed: deliverySpeed })
      .then((result) => { if (!active) return; setDeliveryQuote(result as DeliveryQuoteWithZone); setSelectedDeliveryServiceId(result.status === "quoted" ? result.options.find((option) => option.mode === "door_to_door")?.serviceId || result.options[0]?.serviceId || "" : ""); setSelectedCollectionPointId(""); })
      .catch((err: any) => { if (!active) return; setDeliveryQuote(null); setSelectedDeliveryServiceId(""); setSelectedCollectionPointId(""); setDeliveryError(err?.message || "Delivery pricing could not be prepared."); })
      .finally(() => { if (active) setDeliveryLoading(false); });
    return () => { active = false; };
  }, [quote?.id, fulfilmentMode, deliveryAddress.city, deliveryAddress.region, deliverySpeed]);

  useEffect(() => { if (fulfilmentMode === "delivery") { setBoundFulfilment(null); setBindingError(""); } }, [fulfilmentMode, deliverySpeed, selectedDeliveryServiceId, selectedCollectionPointId, deliveryAddress]);

  useEffect(() => {
    if (!quote || guest) { setCommercialAccounts([]); setSelectedCommercialAccountId(""); return; }
    let active = true; setCommercialLoading(true);
    listCommercialAccounts().then(({ accounts }) => { if (!active) return; setCommercialAccounts(accounts); setSelectedCommercialAccountId(accounts.find(canUseCredit)?.id || ""); }).catch(() => { if (active) setCommercialAccounts([]); }).finally(() => { if (active) setCommercialLoading(false); });
    return () => { active = false; };
  }, [quote?.id, guest]);

  const expiresLabel = useMemo(() => quote ? new Date(quote.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "", [quote]);
  const eligibleCommercialAccounts = useMemo(() => commercialAccounts.filter(canUseCredit), [commercialAccounts]);
  const selectedCommercialAccount = eligibleCommercialAccounts.find((account) => account.id === selectedCommercialAccountId);
  const selectedDeliveryOption = deliveryQuote?.status === "quoted" ? deliveryQuote.options.find((option) => option.serviceId === selectedDeliveryServiceId) : undefined;
  const collectionPointRequired = Boolean(selectedDeliveryOption && selectedDeliveryOption.mode !== "door_to_door");
  const fulfilmentReady = guest ? fulfilmentMode === "pickup" : boundFulfilment?.status === "bound" && boundFulfilment.mode === fulfilmentMode;
  const deliveryNeedsBinding = fulfilmentMode === "delivery" && !fulfilmentReady;

  function updateAddress<K extends keyof CheckoutDeliveryAddress>(key: K, value: CheckoutDeliveryAddress[K]) { setDeliveryAddress((current) => ({ ...current, [key]: value })); }

  async function finalizeDelivery() {
    const quotedNeedsService = deliveryQuote?.status === "quoted" && !selectedDeliveryServiceId;
    const quotedNeedsPoint = deliveryQuote?.status === "quoted" && collectionPointRequired && !selectedCollectionPointId;
    if (!quote || guest || !deliveryAddressComplete || bindingLoading || !deliveryQuote || quotedNeedsService || quotedNeedsPoint) return;
    setBindingLoading(true); setBindingError("");
    try {
      const result = await bindCheckoutFulfilment({ quoteId: quote.id, mode: "delivery", serviceId: selectedDeliveryServiceId || undefined, collectionPointId: selectedCollectionPointId || undefined, requestedSpeed: deliverySpeed, address: deliveryAddress });
      setBoundFulfilment(result.fulfilment); setQuote((current) => current ? { ...current, deliveryMinor: result.quote.deliveryMinor, totalMinor: result.quote.totalMinor } : current);
    } catch (err: any) { setBoundFulfilment(null); setBindingError(err?.message || "Delivery could not be finalized."); }
    finally { setBindingLoading(false); }
  }

  async function placeOnCommercialCredit() {
    if (!quote || guest || !selectedCommercialAccountId || creditSubmitting || !fulfilmentReady) return;
    setCreditSubmitting(true); setCreditError("");
    try { const result = await submitCommercialCreditCheckout({ quoteId: quote.id, commercialAccountId: selectedCommercialAccountId, purchaseOrderReference: purchaseOrderReference.trim() || undefined }); go(`/order-success?ref=${encodeURIComponent(result.order.id)}&status=${encodeURIComponent(result.order.status)}&settlement=commercial-credit`); }
    catch (err: any) { setCreditError(err?.message || "Commercial credit checkout could not be completed."); }
    finally { setCreditSubmitting(false); }
  }

  if (loading) return <div className="demo-page sc-checkout-page"><Container className="demo-checkout"><section className="sc-checkout-intro"><span>Secure checkout</span><h1>Checking this order.</h1><p>SmartCommerce is confirming current provider pricing and availability before you can continue. Nothing is charged during this check.</p></section></Container></div>;
  if (!quote) {
    const providerIssue = recoveryReason === "provider"; const authIssue = recoveryReason === "auth";
    return <div className="demo-page sc-checkout-page"><Container className="demo-checkout sc-checkout-recovery"><section className="sc-checkout-intro"><span>{providerIssue ? "Order needs a recheck" : authIssue ? "Sign in required" : "Checkout paused"}</span><h1>{providerIssue ? "We can’t verify this cart just yet." : authIssue ? "Sign in to continue." : "We couldn’t prepare checkout."}</h1><p>{providerIssue ? "One or more items could not be confirmed against the live commerce provider. Your cart is still saved, and no payment was attempted or charged." : authIssue ? "Sign in to continue with your saved cart. Your items will still be here when you return." : error || "Checkout is temporarily unavailable. Your cart is safe and no payment was attempted."}</p>{providerIssue ? <div className="sc-checkout-recovery__notice"><ShieldCheck size={20} /><div><strong>No money has moved.</strong><span>SmartCommerce blocks payment until every item, price and availability check succeeds server-side.</span></div></div> : null}<div className="sc-checkout-recovery__actions">{providerIssue ? <button type="button" className="sc-checkout-recovery__primary" onClick={() => void prepareCheckout()}><RefreshCw size={17} /> Check again</button> : null}{authIssue ? <button type="button" className="sc-checkout-recovery__primary" onClick={() => go("/account?intent=checkout")}><UserRound size={17} /> Sign in or create account</button> : null}<button type="button" onClick={() => go("/cart")}><PackageCheck size={17} /> Review cart</button><button type="button" onClick={() => go("/products")}><ShoppingBag size={17} /> Continue shopping</button></div>{!providerIssue && !authIssue && error ? <p className="sc-checkout-recovery__detail">{error}</p> : null}</section></Container></div>;
  }

  return <div className="demo-page sc-checkout-page"><Container className="demo-checkout sc-checkout-premium">
    <section className="sc-checkout-intro"><span>{guest ? "Guest checkout" : "Secure checkout"}</span><h1>Review the order we just verified.</h1><p>{guest ? "No account required. " : ""}This quote comes from current provider data and expires at {expiresLabel}. Prices are never trusted from browser state.</p><div className="sc-checkout-assurance-grid"><div><ShieldCheck size={20} /><strong>Provider verified</strong><span>Products and pricing rechecked server-side.</span></div><div><PackageCheck size={20} /><strong>Short-lived quote</strong><span>Stale prices cannot silently pass checkout.</span></div><div><UserRound size={20} /><strong>{guest ? "No account required" : "Account synced"}</strong><span>{guest ? "Complete checkout without creating a profile." : "Your cart stays attached to your account."}</span></div></div></section>

    <section className="demo-flow-form sc-checkout-summary">
      <div className="sc-checkout-summary__head"><span>Order</span><strong>{quote.items.length} {quote.items.length === 1 ? "item" : "items"}</strong></div>
      {quote.items.map((item) => <div key={item.productId} className="sc-checkout-line"><span><small>{item.quantity} ×</small> {item.name}</span><strong>{new Intl.NumberFormat("en-JM", { style: "currency", currency: item.currency }).format(item.unitPrice * item.quantity)}</strong></div>)}
      <div className="sc-checkout-divider" /><div className="sc-checkout-line"><span>Subtotal</span><strong>{formatMinor(quote.subtotalMinor, quote.currency)}</strong></div><div className="sc-checkout-line"><span>Tax</span><strong>{formatMinor(quote.taxMinor, quote.currency)}</strong></div><div className="sc-checkout-line"><span>Delivery</span><strong>{fulfilmentMode === "pickup" ? "Free pickup" : boundFulfilment?.status === "bound" && boundFulfilment.mode === "delivery" ? formatMinor(quote.deliveryMinor, quote.currency) : selectedDeliveryOption ? `${formatJmd(selectedDeliveryOption.customerChargeJmd)} estimate` : "Pending fulfilment"}</strong></div><div className="demo-cart-total"><span>{fulfilmentReady ? "Verified total" : "Verified merchandise total"}</span><strong>{formatMinor(quote.totalMinor, quote.currency)}</strong></div>

      <div className="sc-fulfilment" aria-label="Fulfilment method"><div className="sc-fulfilment__heading"><span className="sc-order-summary__eyebrow">How do you want your order?</span><p>Delivery is revalidated server-side before it becomes part of the amount you can pay or charge to an account.</p></div><div className="sc-fulfilment__modes"><button type="button" className={fulfilmentMode === "pickup" ? "is-active" : ""} onClick={() => { setFulfilmentMode("pickup"); setBoundFulfilment(null); setBindingError(""); }}><Store size={20} /><span><strong>Pick up in store</strong><small>No delivery charge. Branch readiness is confirmed before collection.</small></span></button><button type="button" className={fulfilmentMode === "delivery" ? "is-active" : ""} onClick={() => { setFulfilmentMode("delivery"); setBoundFulfilment(null); setBindingError(""); }}><Truck size={20} /><span><strong>Deliver my order</strong><small>SmartCommerce resolves the courier zone from the destination; large items and rentals go to manual logistics review.</small></span></button></div>

        {fulfilmentMode === "pickup" && !guest ? <div className="sc-fulfilment__status">{bindingLoading ? <Loader2 size={18} className="sc-spin" /> : <CheckCircle2 size={18} />}<span>{bindingLoading ? "Confirming pickup on this quote…" : boundFulfilment?.status === "bound" ? "Pickup is attached to the verified checkout quote at J$0 delivery." : bindingError || "Pickup will be confirmed before order submission."}</span></div> : null}

        {fulfilmentMode === "delivery" ? <div className="sc-fulfilment__delivery">
          {!guest ? <ReadyManualDeliveryPanel quoteId={quote.id} currency={quote.currency} onAttached={(result) => { setFulfilmentMode("delivery"); setBoundFulfilment(result.fulfilment as BoundFulfilment); setBindingError(""); setQuote((current) => current ? { ...current, deliveryMinor: result.quote.deliveryMinor, totalMinor: result.quote.totalMinor } : current); }} /> : null}
          {!guest ? <SavedDeliveryAddressPicker value={deliveryAddress} onSelect={(address) => { setDeliveryAddress(address); setBoundFulfilment(null); setBindingError(""); }} /> : null}

          <div className="sc-fulfilment__address"><div className="sc-fulfilment__address-head"><MapPin size={18} /><div><strong>Delivery destination</strong><span>Use a home, business, or job-site address. SmartCommerce determines the courier zone from the town and parish.</span></div></div><div className="sc-fulfilment__address-grid"><label>Address type<select value={deliveryAddress.type} onChange={(event) => updateAddress("type", event.target.value as CheckoutDeliveryAddress["type"])}><option value="home">Home</option><option value="business">Business</option><option value="job_site">Job site</option></select></label>{deliveryAddress.type === "job_site" ? <label>Job-site name<input value={deliveryAddress.siteName || ""} onChange={(event) => updateAddress("siteName", event.target.value)} placeholder="Eg. Half-Way Tree renovation" /></label> : null}<label>Recipient<input value={deliveryAddress.recipientName} onChange={(event) => updateAddress("recipientName", event.target.value)} autoComplete="name" /></label><label>Phone<input value={deliveryAddress.phone} onChange={(event) => updateAddress("phone", event.target.value)} inputMode="tel" autoComplete="tel" /></label><label className="is-wide">Street address<input value={deliveryAddress.line1} onChange={(event) => updateAddress("line1", event.target.value)} autoComplete="address-line1" /></label><label className="is-wide">Address line 2 <span>(optional)</span><input value={deliveryAddress.line2 || ""} onChange={(event) => updateAddress("line2", event.target.value)} autoComplete="address-line2" /></label><label>Town / city<input value={deliveryAddress.city} onChange={(event) => updateAddress("city", event.target.value)} autoComplete="address-level2" placeholder="Eg. Mandeville" /></label><label>Parish / region<select value={deliveryAddress.region} onChange={(event) => updateAddress("region", event.target.value)} autoComplete="address-level1"><option value="">Choose parish</option>{JAMAICA_PARISHES.map((parish) => <option key={parish} value={parish}>{parish}</option>)}</select></label><label className="is-wide">Delivery notes <span>(optional)</span><textarea value={deliveryAddress.notes || ""} onChange={(event) => updateAddress("notes", event.target.value)} placeholder="Gate, landmark, site contact, access instructions…" rows={3} /></label></div></div>

          <div className="sc-fulfilment__controls sc-fulfilment__controls--zone"><div className="sc-fulfilment__zone"><MapPin size={17} /><div><strong>Courier area</strong>{!deliveryAddress.city.trim() || !deliveryAddress.region.trim() ? <span>Add the town and parish to classify this destination.</span> : deliveryLoading ? <span>Resolving this destination…</span> : deliveryQuote?.zone?.status === "resolved" ? <span>{deliveryQuote.zone.town}, {deliveryQuote.zone.parish} · {deliveryQuote.zone.destinationClass.replace("_", " ")} · provider zone {deliveryQuote.zone.taraAreaClass}</span> : <span>This location needs staff zone verification before a final delivery price can be trusted.</span>}</div></div><label><Truck size={16} /> Speed<select value={deliverySpeed} onChange={(event) => setDeliverySpeed(event.target.value as DeliverySpeed)}><option value="standard">Standard / next day</option><option value="same_day" disabled={deliveryQuote?.zone?.status === "resolved" && !deliveryQuote.zone.sameDayEligible}>Same day where provider-verified</option></select></label></div>
          <p className="sc-fulfilment__estimate-note">Customers no longer choose metro, regular, rural or remote. SmartCommerce resolves that class from authoritative courier-area data, then recalculates it again when delivery is attached to the order.</p>

          {deliveryLoading ? <div className="sc-fulfilment__status"><Loader2 size={18} className="sc-spin" /><span>Resolving the destination, parcel facts and courier rates…</span></div> : null}
          {deliveryError ? <div className="sc-fulfilment__manual"><strong>Delivery pricing is temporarily unavailable.</strong><span>{deliveryError}</span></div> : null}
          {!deliveryLoading && deliveryQuote?.status === "manual_review" ? <div className="sc-fulfilment__manual"><strong>Manual delivery review required.</strong><span>{deliveryQuote.message}</span><small>Your completed destination can be sent directly to logistics; no courier selection is required first.</small></div> : null}
          {!deliveryLoading && deliveryQuote?.status === "quoted" ? <div className="sc-fulfilment__options"><div className="sc-fulfilment__facts"><span>{deliveryQuote.billableWeightLb} lb billable weight</span><span>20% SmartCommerce operations markup included</span></div>{deliveryQuote.options.map((option) => <button type="button" key={option.serviceId} className={selectedDeliveryServiceId === option.serviceId ? "is-active" : ""} onClick={() => { setSelectedDeliveryServiceId(option.serviceId); setSelectedCollectionPointId(""); }}><span><strong>{option.label}</strong><small>{option.mode === "door_to_door" ? "Door to door" : "Collect from a verified courier branch"}</small></span><strong>{formatJmd(option.customerChargeJmd)}</strong></button>)}<div className="sc-fulfilment__cost-note"><ShieldCheck size={16} /><span>Courier cost and our 20% operational markup are recorded separately for reconciliation.</span></div></div> : null}

          {collectionPointRequired && selectedDeliveryServiceId ? <CourierCollectionPointPicker serviceId={selectedDeliveryServiceId} selectedId={selectedCollectionPointId} onSelect={(id) => setSelectedCollectionPointId(id)} /> : null}

          {guest ? <div className="sc-fulfilment__manual"><strong>Guest delivery finalization is the next checkout adapter.</strong><span>You can review destination-aware courier estimates now, but SmartCommerce will not pretend an estimate is payable until the guest-order binding contract is implemented.</span></div> : <>
            {boundFulfilment?.status === "manual_review" ? <div className="sc-fulfilment__manual"><strong>Sent for manual logistics review.</strong><span>{boundFulfilment.message}</span><small>Your address and delivery request were recorded; payment remains blocked until staff set the final transport price.</small></div> : null}
            {boundFulfilment?.status === "bound" && boundFulfilment.mode === "delivery" ? <div className="sc-fulfilment__verified"><CheckCircle2 size={18} /><div><strong>Delivery verified and attached.</strong><span>{boundFulfilment.serviceLabel} · {formatJmd(boundFulfilment.customerChargeJmd)}{boundFulfilment.collectionPoint ? ` · collect at ${boundFulfilment.collectionPoint.name}` : ""}. The verified total above now includes delivery.</span></div></div> : null}
            {bindingError ? <div className="sc-fulfilment__manual"><strong>Delivery was not attached.</strong><span>{bindingError}</span></div> : null}
            <button type="button" className="sc-fulfilment__bind" disabled={!deliveryAddressComplete || !deliveryQuote || bindingLoading || deliveryLoading || (deliveryQuote.status === "quoted" && (!selectedDeliveryServiceId || (collectionPointRequired && !selectedCollectionPointId)))} onClick={() => void finalizeDelivery()}>{bindingLoading ? <><Loader2 size={17} className="sc-spin" /> Verifying delivery…</> : deliveryQuote?.status === "manual_review" ? <><Truck size={17} /> Send for logistics review</> : <><ShieldCheck size={17} /> Verify & attach delivery</>}</button>
          </>}
        </div> : null}
      </div>

      <div className="sc-checkout-settlement" aria-label="Checkout method"><span className="sc-order-summary__eyebrow">How do you want to settle this order?</span><div className="sc-checkout-settlement__options"><button type="button" className={settlementMode === "standard" ? "is-active" : ""} onClick={() => setSettlementMode("standard")}><CreditCard size={19} /><span><strong>Pay now or at branch</strong><small>Available methods are verified from server configuration.</small></span></button>{!guest ? <button type="button" className={settlementMode === "commercial-credit" ? "is-active" : ""} onClick={() => setSettlementMode("commercial-credit")}><BriefcaseBusiness size={19} /><span><strong>Commercial account credit</strong><small>For approved organisations with provider-backed terms.</small></span></button> : null}</div></div>
      {settlementMode === "standard" ? <PaymentMethodPanel /> : null}
      {settlementMode === "commercial-credit" && !guest ? <div className="sc-commercial-credit-checkout"><div className="sc-checkout-trust"><BriefcaseBusiness size={22} /><div><strong>Charge this purchase to an approved commercial account.</strong><span>SmartCommerce rechecks organisation verification, your purchasing authority, provider mapping, payment terms and approval thresholds on the server before the provider order is created.</span></div></div>{!fulfilmentReady ? <div className="sc-fulfilment__manual"><strong>Fulfilment must be finalized first.</strong><span>{deliveryNeedsBinding ? "Verify delivery or send the shipment for logistics review before creating the order." : "SmartCommerce is still confirming pickup on the checkout quote."}</span></div> : null}{commercialLoading ? <p role="status"><Loader2 size={16} /> Checking commercial credit eligibility…</p> : eligibleCommercialAccounts.length ? <><label>Commercial account<select value={selectedCommercialAccountId} onChange={(event) => { setSelectedCommercialAccountId(event.target.value); setCreditError(""); }}>{eligibleCommercialAccounts.map((account) => <option key={account.id} value={account.id}>{account.display_name} · {account.payment_terms_code}</option>)}</select></label>{selectedCommercialAccount ? <div className="sc-commercial-credit-checkout__terms"><CheckCircle2 size={18} /><div><strong>{selectedCommercialAccount.display_name}</strong><span>Approved account terms: {selectedCommercialAccount.payment_terms_code}. Final credit availability is confirmed by the connected provider when the order is submitted.</span></div></div> : null}<label>PO / job reference <span>(optional)</span><input value={purchaseOrderReference} onChange={(event) => setPurchaseOrderReference(event.target.value.slice(0, 120))} placeholder="Eg. PO-1048 or Kingston site" maxLength={120} /></label>{creditError ? <p className="sc-account-real__error" role="alert">{creditError}</p> : null}<button type="button" disabled={!selectedCommercialAccountId || creditSubmitting || !fulfilmentReady} onClick={placeOnCommercialCredit}>{creditSubmitting ? <><Loader2 size={16} /> Submitting to provider…</> : "Place order on commercial credit"}</button><p className="sc-flow-note">This does not mark the invoice as paid. The provider creates the order on the organisation’s approved account terms.</p></> : <div className="sc-commercial-credit-checkout__locked"><strong>No approved commercial credit account is available.</strong><p>Apply for a commercial account or complete organisation verification, purchasing authority and provider payment-term setup first.</p><a href={routeHref("/commercial?mode=credit")}>Open Commercial</a></div>}</div> : null}
      <button className="sc-checkout-back" type="button" onClick={() => go("/cart")}>Return to cart</button>
    </section>
  </Container></div>;
}
