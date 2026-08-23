import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Loader2, LogOut, RefreshCw, ShieldCheck, WalletCards } from "lucide-react";
import Container from "../components/shared/Container";
import { getStaffSession, loginStaff, logoutStaff, type StaffSessionSummary } from "../services/deliveryReviewClient";
import { getCommercialCreditReconciliation, type CommercialCreditReservationItem } from "../services/commercialCreditReconciliationClient";
import "../styles/refund-reconciliation.css";

function money(value: number, currency = "JMD") {
  return new Intl.NumberFormat("en-JM", { style: "currency", currency }).format(Number(value || 0) / 100);
}

const COPY: Record<CommercialCreditReservationItem["state"], { title: string; detail: string }> = {
  active_reservation: { title: "Credit currently reserved", detail: "This checkout is actively holding part of the organisation's available credit." },
  expired_reservation: { title: "Reservation expired", detail: "This hold no longer consumes credit, but remains visible for audit and troubleshooting." },
  committed_unreconciled: { title: "Committed order awaiting provider reconciliation", detail: "The order was accepted, so the amount remains reserved until provider-synced accounting evidence arrives." },
  reconciled_commitment: { title: "Provider reconciliation complete", detail: "Provider-synced accounting evidence now exists for this committed order." },
  released: { title: "Reservation released", detail: "The checkout did not complete and this amount no longer consumes account credit." },
};

export default function CommercialCreditReconciliationPage() {
  const [staff, setStaff] = useState<StaffSessionSummary | null>(null);
  const [checking, setChecking] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [items, setItems] = useState<CommercialCreditReservationItem[]>([]);
  const [summary, setSummary] = useState({ total: 0, consumingCredit: 0, active: 0, expired: 0, committedUnreconciled: 0, reconciled: 0, released: 0, consumingAmountMinor: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getStaffSession().then((result) => { if (active) setStaff(result.authenticated ? result.staff : null); }).catch(() => { if (active) setStaff(null); }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);

  async function refresh() {
    if (!staff) return;
    setLoading(true); setError("");
    try { const result = await getCommercialCreditReconciliation(); setItems(result.items); setSummary(result.summary); }
    catch (cause: any) { setError(cause?.message || "Commercial-credit reconciliation could not be loaded."); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (staff) void refresh(); }, [staff]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault(); setLoginError("");
    try { const result = await loginStaff({ username: username.trim(), password }); setStaff(result.staff); setPassword(""); }
    catch (cause: any) { setLoginError(cause?.message || "Staff sign-in failed."); }
  }
  async function signOut() { await logoutStaff().catch(() => undefined); setStaff(null); setItems([]); }

  if (checking) return <div className="sc-refund-page"><Container><div className="sc-refund-empty"><Loader2 className="sc-spin" size={20} /> Checking staff access…</div></Container></div>;
  if (!staff) return <div className="sc-refund-page"><Container className="sc-refund-shell"><section className="sc-refund-login"><span><ShieldCheck size={17} /> Finance controls</span><h1>Commercial credit reconciliation</h1><p>Sign in with authorized Total Tools staff credentials to review credit reservations and provider reconciliation.</p><form onSubmit={signIn}><label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label><label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required /></label>{loginError ? <p role="alert">{loginError}</p> : null}<button type="submit">Sign in</button></form></section></Container></div>;

  return <div className="sc-refund-page"><Container className="sc-refund-shell">
    <header className="sc-refund-hero"><div><span><WalletCards size={17} /> Credit integrity</span><h1>Commercial credit reconciliation</h1><p>See exactly which checkout reservations are consuming commercial credit, which expired safely, and which committed orders still need provider accounting evidence.</p></div><div className="sc-refund-hero__actions"><button type="button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} className={loading ? "sc-spin" : ""} /> Refresh</button><button type="button" onClick={() => void signOut()}><LogOut size={16} /> Sign out</button></div></header>

    <section className="sc-refund-summary"><article><strong>{summary.consumingCredit}</strong><span>Consuming credit</span></article><article><strong>{summary.active}</strong><span>Active reservations</span></article><article><strong>{summary.committedUnreconciled}</strong><span>Awaiting provider reconciliation</span></article><article><strong>{money(summary.consumingAmountMinor)}</strong><span>Amount currently reserved</span></article></section>

    {error ? <p className="sc-refund-error" role="alert">{error}</p> : null}
    {!loading && !items.length ? <section className="sc-refund-empty"><CheckCircle2 size={28} /><strong>No commercial-credit reservations yet.</strong><span>New commercial-credit checkouts will appear here as they reserve, commit, reconcile, expire, or release credit.</span></section> : null}

    <div className="sc-refund-list">{items.map((item) => { const copy = COPY[item.state]; const Icon = item.state === "committed_unreconciled" ? AlertTriangle : item.state === "active_reservation" ? Clock3 : CheckCircle2; return <article className="sc-refund-card" key={item.id}><div className="sc-refund-card__head"><div><Icon size={20} /><div><span>{item.commercialAccountName || item.commercialAccountId}</span><strong>{copy.title}</strong></div></div><span>{item.state.replaceAll("_", " ")}</span></div><p>{copy.detail}</p><dl><div><dt>Amount</dt><dd>{money(item.amountMinor, item.currency)}</dd></div><div><dt>Order</dt><dd>{item.orderId || "Not committed"}</dd></div><div><dt>Quote</dt><dd>{item.quoteId}</dd></div><div><dt>Consumes credit</dt><dd>{item.consumesCredit ? "Yes" : "No"}</dd></div></dl><footer><span>Reservation {item.id}</span><time>{new Date(item.updatedAt).toLocaleString("en-JM")}</time></footer></article>; })}</div>
  </Container></div>;
}
