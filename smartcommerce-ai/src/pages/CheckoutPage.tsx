import { BriefcaseBusiness, CheckCircle2, CreditCard, Loader2, PackageCheck, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Container from "../components/shared/Container";
import CheckoutPayment from "../components/shared/CheckoutPayment";
import { createCheckoutQuote, createGuestCheckoutQuote, type CheckoutQuote, type GuestCheckoutItem } from "../lib/customerCommerce";
import { go, routeHref } from "../lib/router";
import { listCommercialAccounts, type CommercialAccountSummary } from "../services/commercialAccountClient";

type SettlementMode = "standard" | "commercial-credit";

type CreditCheckoutResult = {
  order: {
    id: string;
    status: string;
    commercialAccountId: string;
    commercialAccountName: string;
    paymentTermsCode: string;
    purchaseOrderReference?: string | null;
  };
};

type ApiErrorPayload = { error?: { code?: string; message?: string } };

function formatMinor(value: number, currency = "JMD") {
  return new Intl.NumberFormat("en-JM", { style: "currency", currency }).format(value / 100);
}

async function submitCommercialCreditCheckout(input: {
  quoteId: string;
  commercialAccountId: string;
  purchaseOrderReference?: string;
}) {
  const response = await fetch("/api/commercial-credit-checkout", {
    method: "POST",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => ({})) as CreditCheckoutResult & ApiErrorPayload;
  if (!response.ok) {
    const error = new Error(payload.error?.message || "Commercial credit checkout could not be completed.") as Error & { code?: string; status?: number };
    error.code = payload.error?.code;
    error.status = response.status;
    throw error;
  }
  return payload as CreditCheckoutResult;
}

const canUseCredit = (account: CommercialAccountSummary) =>
  account.verification_status === "verified" &&
  account.privilege_status === "enabled" &&
  account.authority_status === "verified" &&
  account.mapping_status === "verified" &&
  Boolean(account.payment_terms_code) &&
  ["owner", "admin", "buyer", "approver"].includes(account.role);

export default function CheckoutPage({ guestCart }: { guestCart: GuestCheckoutItem[] }) {
  const paymentQuote=new URLSearchParams(window.location.hash.split('?')[1]||window.location.search).get('paymentQuote');
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [settlementMode, setSettlementMode] = useState<SettlementMode>("standard");
  const [commercialAccounts, setCommercialAccounts] = useState<CommercialAccountSummary[]>([]);
  const [commercialLoading, setCommercialLoading] = useState(false);
  const [selectedCommercialAccountId, setSelectedCommercialAccountId] = useState("");
  const [purchaseOrderReference, setPurchaseOrderReference] = useState("");
  const [creditSubmitting, setCreditSubmitting] = useState(false);
  const [creditError, setCreditError] = useState("");

  useEffect(() => {
    let active = true;
    async function prepareCheckout() {
      if(paymentQuote){setLoading(false);return;}
      try {
        const value = await createCheckoutQuote();
        if (active) setQuote(value);
      } catch (err: any) {
        if (err?.status === 401 && guestCart.length) {
          try {
            const guestQuote = await createGuestCheckoutQuote(guestCart);
            if (active) { setQuote(guestQuote); setAuthRequired(false); }
            return;
          } catch (guestError: any) {
            if (active) setError(guestError?.message || "Guest checkout could not be prepared.");
            return;
          }
        }
        if (active) { setError(err?.message || "Checkout could not be prepared."); setAuthRequired(err?.status === 401); }
      } finally {
        if (active) setLoading(false);
      }
    }
    void prepareCheckout();
    return () => { active = false; };
  }, [guestCart,paymentQuote]);

  const guest = quote?.checkoutMode === "guest";

  useEffect(() => {
    if (!quote || guest) {
      setCommercialAccounts([]);
      setSelectedCommercialAccountId("");
      return;
    }
    let active = true;
    setCommercialLoading(true);
    listCommercialAccounts()
      .then(({ accounts }) => {
        if (!active) return;
        setCommercialAccounts(accounts);
        const firstEligible = accounts.find(canUseCredit);
        setSelectedCommercialAccountId(firstEligible?.id || "");
      })
      .catch(() => {
        if (active) setCommercialAccounts([]);
      })
      .finally(() => {
        if (active) setCommercialLoading(false);
      });
    return () => { active = false; };
  }, [quote, guest]);

  const expiresLabel = useMemo(() => quote ? new Date(quote.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "", [quote]);
  const eligibleCommercialAccounts = useMemo(() => commercialAccounts.filter(canUseCredit), [commercialAccounts]);
  const selectedCommercialAccount = eligibleCommercialAccounts.find((account) => account.id === selectedCommercialAccountId);

  async function placeOnCommercialCredit() {
    if (!quote || guest || !selectedCommercialAccountId || creditSubmitting) return;
    setCreditSubmitting(true);
    setCreditError("");
    try {
      const result = await submitCommercialCreditCheckout({
        quoteId: quote.id,
        commercialAccountId: selectedCommercialAccountId,
        purchaseOrderReference: purchaseOrderReference.trim() || undefined,
      });
      go(`/order-success?ref=${encodeURIComponent(result.order.id)}&status=${encodeURIComponent(result.order.status)}&settlement=commercial-credit`);
    } catch (err: any) {
      setCreditError(err?.message || "Commercial credit checkout could not be completed.");
    } finally {
      setCreditSubmitting(false);
    }
  }

  if(paymentQuote)return <div className="demo-page sc-checkout-page"><Container className="demo-checkout"><section className="sc-checkout-intro"><h1>Payment status</h1><CheckoutPayment quoteId={paymentQuote} returning/><button type="button" onClick={()=>go('/account')}>View my account</button></section></Container></div>;
  if (loading) return <div className="demo-page sc-checkout-page"><Container className="demo-checkout"><section className="sc-checkout-intro"><span>Secure checkout</span><h1>Checking your order…</h1><p>We’re checking prices, product availability and tax.</p></section></Container></div>;

  if (!quote) return <div className="demo-page sc-checkout-page"><Container className="demo-checkout"><section className="sc-checkout-intro"><span>Checkout unavailable</span><h1>We couldn’t prepare this order.</h1><p>{authRequired ? "Sign in to continue with your saved cart. Your cart will still be here when you return." : error}</p>{authRequired ? <><button onClick={() => go("/account?intent=checkout")}>Sign in or create account</button><button onClick={() => go("/cart")}>Return to cart</button></> : <button onClick={() => go("/cart")}>Return to cart</button>}</section></Container></div>;

  return (
    <div className="demo-page sc-checkout-page">
      <Container className="demo-checkout sc-checkout-premium">
        <section className="sc-checkout-intro">
          <span>{guest ? "Guest checkout" : "Secure checkout"}</span>
          <h1>Review your order.</h1>
          <p>{guest ? "No account required. " : ""}This quote comes from current provider data and expires at {expiresLabel}. Prices are never trusted from browser state.</p>
          <div className="sc-checkout-assurance-grid">
            <div><ShieldCheck size={20} /><strong>Provider verified</strong><span>Products and pricing rechecked server-side.</span></div>
            <div><PackageCheck size={20} /><strong>Short-lived quote</strong><span>Stale prices cannot silently pass checkout.</span></div>
            <div><UserRound size={20} /><strong>{guest ? "No account required" : "Account synced"}</strong><span>{guest ? "Complete checkout without creating a profile." : "Your cart stays attached to your account."}</span></div>
          </div>
        </section>

        <section className="demo-flow-form sc-checkout-summary">
          <div className="sc-checkout-summary__head"><span>Order</span><strong>{quote.items.length} {quote.items.length === 1 ? "item" : "items"}</strong></div>
          {quote.items.map((item) => <div key={item.productId} className="sc-checkout-line"><span><small>{item.quantity} ×</small> {item.name}</span><strong>{new Intl.NumberFormat("en-JM", { style: "currency", currency: item.currency }).format(item.unitPrice * item.quantity)}</strong></div>)}
          <div className="sc-checkout-divider" />
          <div className="sc-checkout-line"><span>Subtotal</span><strong>{formatMinor(quote.subtotalMinor, quote.currency)}</strong></div>
          <div className="sc-checkout-line"><span>Tax</span><strong>{formatMinor(quote.taxMinor, quote.currency)}</strong></div>
          <div className="sc-checkout-line"><span>Delivery</span><strong>{quote.deliveryMinor ? formatMinor(quote.deliveryMinor, quote.currency) : "Calculated with fulfillment"}</strong></div>
          <div className="demo-cart-total"><span>Verified total</span><strong>{formatMinor(quote.totalMinor, quote.currency)}</strong></div>

          <div className="sc-checkout-settlement" aria-label="Checkout method">
            <span className="sc-order-summary__eyebrow">How do you want to settle this order?</span>
            <div className="sc-checkout-settlement__options">
              <button type="button" className={settlementMode === "standard" ? "is-active" : ""} onClick={() => setSettlementMode("standard")}>
                <CreditCard size={19} />
                <span><strong>Standard payment</strong><small>Secure card checkout.</small></span>
              </button>
              {!guest ? <button type="button" className={settlementMode === "commercial-credit" ? "is-active" : ""} onClick={() => setSettlementMode("commercial-credit")}>
                <BriefcaseBusiness size={19} />
                <span><strong>Commercial account credit</strong><small>For approved organisations with provider-backed terms.</small></span>
              </button> : null}
            </div>
          </div>

          {settlementMode === "standard" ? <>
            {guest?<p>Sign in to use secure online payment for a saved order.</p>:<CheckoutPayment quoteId={quote.id}/>}
          </> : null}

          {settlementMode === "commercial-credit" && !guest ? (
            <div className="sc-commercial-credit-checkout">
              <div className="sc-checkout-trust"><BriefcaseBusiness size={22} /><div><strong>Charge this purchase to an approved commercial account.</strong><span>SmartCommerce rechecks organisation verification, your purchasing authority, provider mapping, payment terms and approval thresholds on the server before the provider order is created.</span></div></div>

              {commercialLoading ? <p role="status"><Loader2 size={16} /> Checking commercial credit eligibility…</p> : eligibleCommercialAccounts.length ? <>
                <label>Commercial account
                  <select value={selectedCommercialAccountId} onChange={(event) => { setSelectedCommercialAccountId(event.target.value); setCreditError(""); }}>
                    {eligibleCommercialAccounts.map((account) => <option key={account.id} value={account.id}>{account.display_name} · {account.payment_terms_code}</option>)}
                  </select>
                </label>
                {selectedCommercialAccount ? <div className="sc-commercial-credit-checkout__terms"><CheckCircle2 size={18} /><div><strong>{selectedCommercialAccount.display_name}</strong><span>Approved account terms: {selectedCommercialAccount.payment_terms_code}. Final credit availability is confirmed by the connected provider when the order is submitted.</span></div></div> : null}
                <label>PO / job reference <span>(optional)</span>
                  <input value={purchaseOrderReference} onChange={(event) => setPurchaseOrderReference(event.target.value.slice(0, 120))} placeholder="Eg. PO-1048 or Kingston site" maxLength={120} />
                </label>
                {creditError ? <p className="sc-account-real__error" role="alert">{creditError}</p> : null}
                <button type="button" disabled={!selectedCommercialAccountId || creditSubmitting} onClick={placeOnCommercialCredit}>{creditSubmitting ? <><Loader2 size={16} /> Submitting to provider…</> : "Place order on commercial credit"}</button>
                <p className="sc-flow-note">This does not mark the invoice as paid. The provider creates the order on the organisation’s approved account terms.</p>
              </> : <div className="sc-commercial-credit-checkout__locked"><strong>No approved commercial credit account is available.</strong><p>Apply for a commercial account or complete organisation verification, purchasing authority and provider payment-term setup first.</p><a href={routeHref("/commercial?mode=credit")}>Open Commercial</a></div>}
            </div>
          ) : null}

          <button className="sc-checkout-back" type="button" onClick={() => go("/cart")}>Return to cart</button>
        </section>
      </Container>
    </div>
  );
}
