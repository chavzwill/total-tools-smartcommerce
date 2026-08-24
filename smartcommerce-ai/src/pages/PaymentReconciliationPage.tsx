import { AlertTriangle, CheckCircle2, Clock3, CreditCard, Loader2, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import Container from "../components/shared/Container";
import { getStaffSession, loginStaff, logoutStaff, type StaffSessionSummary } from "../services/deliveryReviewClient";
import { getPaymentReconciliation, type PaymentProviderReadiness, type PaymentReconciliationItem } from "../services/paymentReconciliationClient";
import { recheckPaymentProvider } from "../services/paymentProviderRecheckClient";
import "../styles/refund-reconciliation.css";

function money(value: number, currency = "JMD") {
  return new Intl.NumberFormat("en-JM", { style: "currency", currency }).format(Number(value || 0) / 100);
}

function statusCopy(item: PaymentReconciliationItem) {
  if (item.status === "confirmed" && item.paid) return { title: "Payment confirmed", detail: "Verified provider or POS evidence confirms this payment." };
  if (item.status === "failed") return { title: "Payment failed", detail: "The provider attempt failed. The order must not be treated as paid." };
  if (item.status === "cancelled") return { title: "Payment cancelled", detail: "The payment attempt was cancelled before confirmation." };
  if (item.status === "provider_pending" && item.attention === "stale") return { title: "Provider confirmation is stale", detail: "This payment has remained pending beyond the reconciliation threshold and needs investigation." };
  if (item.status === "provider_pending" && item.attention === "watch") return { title: "Provider confirmation delayed", detail: "This payment is still awaiting verified provider evidence and has entered the watch window." };
  if (item.status === "provider_pending") return { title: "Awaiting provider confirmation", detail: "The provider flow started, but SmartCommerce has not received verified payment evidence yet." };
  return { title: "Payment prepared", detail: "SmartCommerce created an idempotent payment attempt. No provider-confirmed payment exists yet." };
}

function providerLabel(key: PaymentProviderReadiness["providers"][number]["key"]) {
  if (key === "primary_acquirer") return "Primary JMD acquirer";
  if (key === "store_pos") return "Store POS";
  return "PayPal";
}

export default function PaymentReconciliationPage() {
  const [staff, setStaff] = useState<StaffSessionSummary | null>(null);
  const [checking, setChecking] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [items, setItems] = useState<PaymentReconciliationItem[]>([]);
  const [providerReadiness, setProviderReadiness] = useState<PaymentProviderReadiness | null>(null);
  const [summary, setSummary] = useState({ total: 0, prepared: 0, pending: 0, confirmed: 0, failed: 0, stale: 0, staleAmountMinor: 0 });
  const [thresholds, setThresholds] = useState({ warningMinutes: 15, staleMinutes: 60 });
  const [loading, setLoading] = useState(false);
  const [recheckingId, setRecheckingId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getStaffSession().then((result) => { if (active) setStaff(result.authenticated ? result.staff : null); }).catch(() => { if (active) setStaff(null); }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);

  async function refresh() {
    if (!staff) return;
    setLoading(true);
    setError("");
    try {
      const result = await getPaymentReconciliation();
      setItems(result.items);
      setSummary(result.summary);
      setThresholds(result.thresholds);
      setProviderReadiness(result.providerReadiness);
    } catch (cause: any) {
      setError(cause?.message || "Payment reconciliation could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (staff) void refresh(); }, [staff]);

  async function recheck(item: PaymentReconciliationItem) {
    if (item.status !== "provider_pending" || recheckingId) return;
    setRecheckingId(item.id);
    setError("");
    try {
      await recheckPaymentProvider(item.id);
      await refresh();
    } catch (cause: any) {
      setError(cause?.message || "The payment provider could not be rechecked.");
    } finally {
      setRecheckingId("");
    }
  }

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setLoginError("");
    try {
      const result = await loginStaff({ username: username.trim(), password });
      setStaff(result.staff);
      setPassword("");
    } catch (cause: any) {
      setLoginError(cause?.message || "Staff sign-in failed.");
    }
  }

  async function signOut() {
    await logoutStaff().catch(() => undefined);
    setStaff(null);
    setItems([]);
    setProviderReadiness(null);
  }

  if (checking) return <div className="sc-refund-page"><Container><div className="sc-refund-empty"><Loader2 className="sc-spin" size={20} /> Checking staff access…</div></Container></div>;
  if (!staff) return <div className="sc-refund-page"><Container className="sc-refund-shell"><section className="sc-refund-login"><span><ShieldCheck size={17} /> Finance controls</span><h1>Payment reconciliation</h1><p>Sign in with authorized Total Tools staff credentials to review standard payment settlement evidence.</p><form onSubmit={signIn}><label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label><label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required /></label>{loginError ? <p role="alert">{loginError}</p> : null}<button type="submit">Sign in</button></form></section></Container></div>;

  return <div className="sc-refund-page"><Container className="sc-refund-shell">
    <header className="sc-refund-hero"><div><span><CreditCard size={17} /> Settlement integrity</span><h1>Payment reconciliation</h1><p>Provider redirects never count as payment proof. This workspace shows the durable SmartCommerce attempt and the verified settlement evidence behind each payment state.</p></div><div className="sc-refund-hero__actions"><button type="button" onClick={() => void refresh()} disabled={loading || Boolean(recheckingId)}><RefreshCw size={16} className={loading ? "sc-spin" : ""} /> Refresh</button><button type="button" onClick={() => void signOut()}><LogOut size={16} /> Sign out</button></div></header>

    <section className="sc-refund-summary"><article><strong>{summary.pending}</strong><span>Provider pending</span></article><article><strong>{summary.stale}</strong><span>Stale settlements</span></article><article><strong>{money(summary.staleAmountMinor)}</strong><span>Stale amount</span></article><article><strong>{summary.confirmed}</strong><span>Verified paid</span></article></section>
    <p className="sc-refund-note">Watch after {thresholds.warningMinutes} minutes · stale after {thresholds.staleMinutes} minutes. Provider recheck asks the provider for authoritative status; it never manually marks a payment paid.</p>

    {providerReadiness ? <section className="sc-refund-list" aria-label="Payment provider readiness">
      {providerReadiness.providers.map((provider) => <article className="sc-refund-card" key={provider.key}>
        <div className="sc-refund-card__head"><div><ShieldCheck size={20} /><div><span>{provider.selectedProvider || "Provider not selected"}</span><strong>{providerLabel(provider.key)}</strong></div></div><span>{provider.executable ? "Executable" : "Not ready"}</span></div>
        <p>{provider.key === "paypal" && provider.currencySupported === false ? `${providerReadiness.currency} is not supported for direct PayPal settlement.` : provider.executable ? "Adapter and merchant configuration are both ready for this provider boundary." : "This provider remains disabled until both the concrete adapter and merchant configuration are ready."}</p>
        <dl><div><dt>Adapter</dt><dd>{provider.adapterImplemented ? "Implemented" : "Pending"}</dd></div><div><dt>Merchant setup</dt><dd>{provider.merchantConfigured ? "Configured" : "Missing"}</dd></div><div><dt>{providerReadiness.currency} support</dt><dd>{provider.currencySupported == null ? "Provider-specific" : provider.currencySupported ? "Supported" : "Unsupported"}</dd></div><div><dt>Feature flags</dt><dd>{provider.methods.filter((method) => method.enabled).map((method) => method.id).join(", ") || "None enabled"}</dd></div></dl>
      </article>)}
    </section> : null}

    {error ? <p className="sc-refund-error" role="alert">{error}</p> : null}
    {!loading && !items.length ? <section className="sc-refund-empty"><CheckCircle2 size={28} /><strong>No payment attempts yet.</strong><span>Standard checkout attempts will appear here once a customer prepares or starts a provider payment.</span></section> : null}

    <div className="sc-refund-list">{items.map((item) => {
      const copy = statusCopy(item);
      const Icon = item.status === "confirmed" && item.paid ? CheckCircle2 : item.attention === "stale" || item.status === "failed" ? AlertTriangle : Clock3;
      return <article className="sc-refund-card" key={item.id}><div className="sc-refund-card__head"><div><Icon size={20} /><div><span>{item.paymentMethod.replaceAll("-", " ")}{item.provider ? ` · ${item.provider}` : ""}</span><strong>{copy.title}</strong></div></div><span>{item.status.replaceAll("_", " ")}</span></div><p>{copy.detail}</p><dl><div><dt>Amount</dt><dd>{money(item.amountMinor, item.currency)}</dd></div><div><dt>Quote</dt><dd>{item.quoteId}</dd></div><div><dt>Provider reference</dt><dd>{item.providerReference || item.providerPaymentId || "Not recorded"}</dd></div><div><dt>Confirmation source</dt><dd>{item.confirmationSource || "None"}</dd></div><div><dt>Age</dt><dd>{item.ageMinutes} min</dd></div><div><dt>Paid</dt><dd>{item.paid ? "Verified" : "No verified proof"}</dd></div></dl><footer><span>Attempt {item.id}</span><div>{item.status === "provider_pending" ? <button type="button" onClick={() => void recheck(item)} disabled={Boolean(recheckingId)}>{recheckingId === item.id ? <><Loader2 size={14} className="sc-spin" /> Rechecking…</> : <><RefreshCw size={14} /> Recheck provider</>}</button> : null}<time>{new Date(item.updatedAt).toLocaleString("en-JM")}</time></div></footer></article>;
    })}</div>
  </Container></div>;
}
