import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, LogOut, RefreshCw, ShieldCheck, WalletCards } from "lucide-react";
import Container from "../components/shared/Container";
import { getStaffSession, loginStaff, logoutStaff, type StaffSessionSummary } from "../services/deliveryReviewClient";
import { getRefundReconciliation, type RefundReconciliationException } from "../services/refundReconciliationClient";
import "../styles/refund-reconciliation.css";

function money(value: number, currency = "JMD") {
  return new Intl.NumberFormat("en-JM", { style: "currency", currency }).format(Number(value || 0) / 100);
}

const COPY: Record<RefundReconciliationException["state"], { title: string; detail: string }> = {
  refund_unmatched: { title: "Refund not found in ledger", detail: "The return says the refund completed, but no accounting refund entry is attached to this order." },
  refund_amount_mismatch: { title: "Refund amount mismatch", detail: "The accounting refund total does not equal the approved return amount." },
  refund_reference_mismatch: { title: "Refund reference mismatch", detail: "A refund exists, but its provider/accounting reference does not match the return record." },
};

export default function RefundReconciliationPage() {
  const [staff, setStaff] = useState<StaffSessionSummary | null>(null);
  const [checking, setChecking] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [items, setItems] = useState<RefundReconciliationException[]>([]);
  const [summary, setSummary] = useState({ total: 0, unmatched: 0, amountMismatch: 0, referenceMismatch: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getStaffSession()
      .then((result) => { if (active) setStaff(result.authenticated ? result.staff : null); })
      .catch(() => { if (active) setStaff(null); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);

  async function refresh() {
    if (!staff) return;
    setLoading(true);
    setError("");
    try {
      const result = await getRefundReconciliation();
      setItems(result.exceptions || []);
      setSummary(result.summary || { total: 0, unmatched: 0, amountMismatch: 0, referenceMismatch: 0 });
    } catch (cause: any) {
      setError(cause?.message || "Refund reconciliation could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (staff) void refresh(); }, [staff]);

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
  }

  if (checking) return <div className="sc-refund-page"><Container><div className="sc-refund-empty"><Loader2 className="sc-spin" size={20} /> Checking staff access…</div></Container></div>;

  if (!staff) return <div className="sc-refund-page"><Container className="sc-refund-shell"><section className="sc-refund-login"><span><ShieldCheck size={17} /> Finance controls</span><h1>Refund reconciliation</h1><p>Sign in with authorized Total Tools staff credentials to review refund/accounting exceptions.</p><form onSubmit={signIn}><label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label><label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required /></label>{loginError ? <p role="alert">{loginError}</p> : null}<button type="submit">Sign in</button></form></section></Container></div>;

  return <div className="sc-refund-page"><Container className="sc-refund-shell">
    <header className="sc-refund-hero"><div><span><WalletCards size={17} /> Refund integrity</span><h1>Refund reconciliation</h1><p>Completed return decisions are checked against the accounting ledger. Nothing is treated as reconciled merely because a staff workflow says “completed.”</p></div><div className="sc-refund-hero__actions"><button type="button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} className={loading ? "sc-spin" : ""} /> Refresh</button><button type="button" onClick={() => void signOut()}><LogOut size={16} /> Sign out</button></div></header>

    <section className="sc-refund-summary"><article><strong>{summary.total}</strong><span>Total exceptions</span></article><article><strong>{summary.unmatched}</strong><span>Missing ledger refunds</span></article><article><strong>{summary.amountMismatch}</strong><span>Amount mismatches</span></article><article><strong>{summary.referenceMismatch}</strong><span>Reference mismatches</span></article></section>

    {error ? <p className="sc-refund-error" role="alert">{error}</p> : null}
    {!loading && !items.length ? <section className="sc-refund-empty"><CheckCircle2 size={28} /><strong>No refund reconciliation exceptions.</strong><span>Completed refunds currently agree with SmartCommerce accounting evidence.</span></section> : null}

    <div className="sc-refund-list">{items.map((item) => {
      const copy = COPY[item.state];
      return <article className="sc-refund-card" key={item.returnId}><div className="sc-refund-card__head"><div><AlertTriangle size={20} /><div><span>{item.orderId}</span><strong>{copy.title}</strong></div></div><span>{item.state.replaceAll("_", " ")}</span></div><p>{copy.detail}</p><dl><div><dt>Approved return</dt><dd>{money(item.approvedMinor, item.currency)}</dd></div><div><dt>Ledger refund total</dt><dd>{money(item.ledgerRefundMinor, item.currency)}</dd></div><div><dt>Ledger refund entries</dt><dd>{item.ledgerRefundCount}</dd></div><div><dt>Return reference</dt><dd>{item.refundReference || "None recorded"}</dd></div></dl><footer><span>Return {item.returnId}</span><time>{new Date(item.updatedAt).toLocaleString("en-JM")}</time></footer></article>;
    })}</div>
  </Container></div>;
}
