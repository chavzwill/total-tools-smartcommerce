import CourierDeliveryPanel from '../components/couriers/CourierDeliveryPanel';
import { BadgeCheck, Bot, BriefcaseBusiness, ChevronRight, KeyRound, LayoutDashboard, LockKeyhole, LogIn, LogOut, MailCheck, PackageCheck, ReceiptText, ShieldCheck, ShoppingBag, UserRound, UserRoundPlus, Wrench } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import Container from "../components/shared/Container";
import AccountPasskeyPanel from "../components/account/AccountPasskeyPanel";
import AccountRentalsPanel from "../components/account/AccountRentalsPanel";
import AccountRepairsPanel from "../components/account/AccountRepairsPanel";
import AccountOverviewAttention from "../components/account/AccountOverviewAttention";
import "../styles/accountTabs.css";
import {
  getCustomerAccount,
  loginCustomer,
  logoutCustomer,
  requestEmailVerification,
  requestPasswordReset,
  resetCustomerPassword,
  signUpCustomer,
  verifyCustomerEmail,
  type CustomerAccount,
} from "../lib/customerAccount";
import { getRoute, routeHref } from "../lib/router";

type Mode = "login" | "signup" | "forgot" | "reset";
type AccountTab = "overview" | "orders" | "rentals" | "repairs" | "commercial" | "security";

const accountTabs = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "orders", label: "Orders", icon: PackageCheck },
  { id: "rentals", label: "Rentals", icon: BriefcaseBusiness },
  { id: "repairs", label: "Repairs", icon: Wrench },
  { id: "commercial", label: "Commercial", icon: BadgeCheck },
  { id: "security", label: "Security", icon: ShieldCheck },
] as const;

function isAccountTab(value: string | null): value is AccountTab {
  return accountTabs.some((tab) => tab.id === value);
}

export default function CustomerAccountPage() {
  const [customer, setCustomer] = useState<CustomerAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<Mode>("login");
  const [accountTab, setAccountTab] = useState<AccountTab>("overview");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resetToken, setResetToken] = useState("");

  useEffect(() => {
    let active = true;
    const query = getRoute().query;
    const verifyToken = query.get("verify") || "";
    const passwordResetToken = query.get("reset") || "";
    const requestedSection = query.get("section");
    if (isAccountTab(requestedSection)) setAccountTab(requestedSection);

    async function initialize() {
      try {
        if (verifyToken) { await verifyCustomerEmail(verifyToken); if (active) setNotice("Email verified. Your SmartCommerce account is now confirmed."); }
        if (passwordResetToken && active) { setResetToken(passwordResetToken); setMode("reset"); }
        const state = await getCustomerAccount(); if (active) setCustomer(state.customer);
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Customer accounts are temporarily unavailable."); }
      finally { if (active) setLoading(false); }
    }
    initialize();
    return () => { active = false; };
  }, []);

  function selectAccountTab(tab: AccountTab) {
    setAccountTab(tab);
    setError("");
    setNotice("");
    const next = routeHref(`/account?section=${tab}`);
    window.history.replaceState(null, "", next);
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true); setError(""); setNotice(""); const form = new FormData(event.currentTarget);
    try { const state = await loginCustomer({ email: String(form.get("email") || ""), password: String(form.get("password") || "") }); setCustomer(state.customer); setAccountTab("overview"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Sign in failed."); }
    finally { setSubmitting(false); }
  }

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true); setError(""); setNotice(""); const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || ""), confirmation = String(form.get("confirmPassword") || "");
    if (password !== confirmation) { setError("Passwords do not match."); setSubmitting(false); return; }
    try {
      const state = await signUpCustomer({ fullName: String(form.get("fullName") || ""), email: String(form.get("email") || ""), phone: String(form.get("phone") || ""), password });
      setCustomer(state.customer); setAccountTab("overview"); setNotice("Account created. Verify your email to complete your account security setup.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Account creation failed."); }
    finally { setSubmitting(false); }
  }

  async function handleForgotPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true); setError(""); setNotice(""); const form = new FormData(event.currentTarget);
    try { const response = await requestPasswordReset(String(form.get("email") || "")); setNotice(response.message || "If that account exists, a reset link will be sent."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Password reset request failed."); }
    finally { setSubmitting(false); }
  }

  async function handleResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true); setError(""); setNotice(""); const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || ""), confirmation = String(form.get("confirmPassword") || "");
    if (password !== confirmation) { setError("Passwords do not match."); setSubmitting(false); return; }
    try {
      await resetCustomerPassword(resetToken, password); setNotice("Password updated. Sign in again with your new password."); setResetToken(""); setCustomer(null); setMode("login"); window.location.hash = "/account";
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Password reset failed."); }
    finally { setSubmitting(false); }
  }

  async function handleVerificationRequest() {
    setSubmitting(true); setError(""); setNotice("");
    try {
      const response = await requestEmailVerification(); setNotice(response.alreadyVerified ? "Your email is already verified." : (response.message || "Verification email sent."));
      if (response.alreadyVerified) { const state = await getCustomerAccount(); setCustomer(state.customer); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Verification request failed."); }
    finally { setSubmitting(false); }
  }

  async function handleLogout() {
    setSubmitting(true); setError(""); setNotice("");
    try { await logoutCustomer(); setCustomer(null); setMode("login"); setAccountTab("overview"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Sign out failed."); }
    finally { setSubmitting(false); }
  }

  if (loading) return <div className="demo-page"><Container className="demo-account sc-account-real"><UserRound size={42} /><span>Customer Account</span><h1>Checking your account…</h1><p>Securely verifying your SmartCommerce session.</p></Container></div>;

  if (customer && mode !== "reset") {
    const firstName = customer.fullName.split(/\s+/)[0];
    const currentTab = accountTabs.find((tab) => tab.id === accountTab) || accountTabs[0];

    return (
      <div className="demo-page sc-account-page">
        <Container className="demo-account sc-account-real sc-account-dashboard">
          <header className="sc-account-hero">
            <div className="sc-account-avatar" aria-hidden="true">{firstName.slice(0, 1).toUpperCase()}</div>
            <div className="sc-account-hero__copy">
              <span className="sc-eyebrow">My account</span>
              <h1>Good to see you, {firstName}.</h1>
              <p>{customer.email}{customer.phone ? ` · ${customer.phone}` : ""}</p>
            </div>
            <button className="sc-signout-button" type="button" disabled={submitting} onClick={handleLogout}><LogOut size={17} /> Sign out</button>
          </header>

          <nav aria-label="Courier account" className="sc-account-courier-entry"><strong>Deliver with Total Tools</strong><a href={routeHref("/couriers/account?mode=signup")}>Sign up as a courier</a><a href={routeHref("/couriers/account")}>Courier sign in</a></nav>

          {!customer.emailVerified && <section className="sc-account-alert"><MailCheck size={21} /><div><strong>Verify your email</strong><span>Verify your address to unlock sensitive account and commercial features.</span></div><button type="button" disabled={submitting} onClick={handleVerificationRequest}>{submitting ? "Sending…" : "Send verification email"}</button></section>}

          <div className="sc-account-workspace">
            <aside className="sc-account-context">
              <div className="sc-account-context__label">Account center</div>
              <nav className="sc-account-nav" aria-label="Account sections">
                {accountTabs.map(({ id, label, icon: Icon }) => (
                  <button key={id} type="button" className={accountTab === id ? "is-active" : ""} aria-current={accountTab === id ? "page" : undefined} onClick={() => selectAccountTab(id)}>
                    <Icon size={18} aria-hidden="true" />
                    <span>{label}</span>
                    <ChevronRight size={16} className="sc-account-nav__chevron" aria-hidden="true" />
                  </button>
                ))}
              </nav>
            </aside>

            <div className="sc-account-content">
              <div className="sc-account-mobile-title"><currentTab.icon size={18} /><span>{currentTab.label}</span></div>

              {accountTab === "overview" && (
                <section className="sc-account-tab-panel">
                  <div className="sc-account-section__heading"><span className="sc-eyebrow">Overview</span><h2>Your account at a glance</h2><p>Your identity, account readiness and useful actions — without repeating the navigation you already have.</p></div>

                  <div className="sc-account-overview-shell">
                    <article className="sc-account-profile-card">
                      <div className="sc-account-profile-card__top"><UserRound size={22} /><span>Profile</span></div>
                      <h3>{customer.fullName}</h3>
                      <dl>
                        <div><dt>Email</dt><dd>{customer.email}</dd></div>
                        <div><dt>Phone</dt><dd>{customer.phone || "Not added"}</dd></div>
                        <div><dt>Identity</dt><dd className={customer.emailVerified ? "is-good" : "is-pending"}>{customer.emailVerified ? "Verified" : "Verification needed"}</dd></div>
                      </dl>
                    </article>

                    <article className="sc-account-readiness-card">
                      <div><span className="sc-eyebrow">Account readiness</span><h3>{customer.emailVerified ? "Ready for secure commerce" : "One step left"}</h3><p>{customer.emailVerified ? "Your verified identity can use stronger security and future connected services." : "Verify your email to unlock sensitive account and commercial features."}</p></div>
                      <button type="button" onClick={() => selectAccountTab("security")}><ShieldCheck size={18} /> Manage security <ChevronRight size={16} /></button>
                    </article>
                  </div>

                  <div className="sc-account-quick-actions">
                    <div className="sc-account-section__heading sc-account-section__heading--compact"><span className="sc-eyebrow">Quick actions</span><h3>Get something done</h3></div>
                    <div className="sc-account-action-grid">
                      <a href={routeHref("/products")}><ShoppingBag size={19} /><span><strong>Shop products</strong><small>Browse tools, parts and equipment.</small></span><ChevronRight size={17} /></a>
                      <a href={routeHref("/assistant")}><Bot size={19} /><span><strong>Ask SmartCommerce AI</strong><small>Describe the job and get guided help.</small></span><ChevronRight size={17} /></a>
                      <button type="button" onClick={() => selectAccountTab("commercial")}><BadgeCheck size={19} /><span><strong>Commercial account</strong><small>Business purchasing and verification.</small></span><ChevronRight size={17} /></button>
                    </div>
                  </div>

                  <AccountOverviewAttention onViewRentals={() => selectAccountTab("rentals")} />
                </section>
              )}

              {accountTab === "orders" && <section className="sc-account-tab-panel"><div className="sc-account-section__heading"><span className="sc-eyebrow">Orders</span><h2>Your purchases</h2><p>Track purchases, fulfilment and order history from one place.</p></div><div className="sc-account-placeholder"><PackageCheck size={28} /><h3>Order history is coming online</h3><p>When provider-backed orders are connected, current and past purchases will appear here automatically.</p></div><CourierDeliveryPanel audience="customer"/><div className="sc-account-real__actions"><a href={routeHref("/products")}>Continue shopping</a></div></section>}

              {accountTab === "rentals" && <section className="sc-account-tab-panel"><div className="sc-account-section__heading"><span className="sc-eyebrow">Rentals</span><h2>Your rentals</h2><p>Manage active equipment, return deadlines, extensions and rental history without leaving your account.</p></div><AccountRentalsPanel /></section>}

              {accountTab === "repairs" && <section className="sc-account-tab-panel"><div className="sc-account-section__heading"><span className="sc-eyebrow">Repairs</span><h2>Your repairs</h2><p>Follow diagnostics, approvals, repair progress and completed service history imported from Total Tools operations.</p></div><AccountRepairsPanel /></section>}

              {accountTab === "commercial" && (
                <section className="sc-account-tab-panel">
                  <div className="sc-account-section__heading"><span className="sc-eyebrow">Commercial</span><h2>Business account & finance</h2><p>Manage organisation verification, purchasing authority, credit controls, transactions and statements.</p></div>
                  <div className="sc-account-action-grid">
                    <a href={routeHref("/commercial#commercial-account")}><BadgeCheck size={19} /><span><strong>Commercial account</strong><small>Apply, verify the organisation, manage sites and projects.</small></span><ChevronRight size={17} /></a>
                    <a href={routeHref("/commercial/accounting")}><ReceiptText size={19} /><span><strong>Statements & transactions</strong><small>Review account activity, approved credit controls and statement periods.</small></span><ChevronRight size={17} /></a>
                    <a href={routeHref("/commercial?mode=quote")}><BriefcaseBusiness size={19} /><span><strong>Request commercial pricing</strong><small>Send products, quantities and project requirements to the commercial team.</small></span><ChevronRight size={17} /></a>
                  </div>
                  <div className="sc-account-placeholder"><ShieldCheck size={28} /><h3>Financial access is permission controlled</h3><p>Statements, account credit and purchasing controls are only shown to authorised commercial members. Official balances are displayed only when the provider/accounting ledger is fully synchronized.</p></div>
                </section>
              )}

              {accountTab === "security" && (
                <section className="sc-account-tab-panel">
                  <div className="sc-account-section__heading"><span className="sc-eyebrow">Security</span><h2>Sign-in & security</h2><p>Passkeys, authenticator MFA and active sessions live here, separate from everyday account activity.</p></div>
                  {customer.emailVerified ? <AccountPasskeyPanel /> : <div className="sc-empty-state">Verify your email to configure passkeys, authenticator MFA and session controls.</div>}
                </section>
              )}
            </div>
          </div>

          {notice && <p role="status" className="sc-account-real__notice">{notice}</p>}
          {error && <p role="alert" className="sc-account-real__error">{error}</p>}
        </Container>
      </div>
    );
  }

  return (
    <div className="demo-page sc-account-page">
      <Container className="demo-account sc-account-real sc-account-real--signed-out">
        <nav aria-label="Courier account" className="sc-account-courier-entry"><strong>Deliver with Total Tools</strong><a href={routeHref("/couriers/account?mode=signup")}>Sign up as a courier</a><a href={routeHref("/couriers/account")}>Courier sign in</a></nav>
        <div className="sc-account-real__intro">
          {mode === "reset" ? <KeyRound size={42} /> : <LockKeyhole size={42} />}
          <span className="sc-eyebrow">SmartCommerce account</span>
          <h1>{mode === "login" ? "Welcome back." : mode === "signup" ? "Create your account." : mode === "forgot" ? "Reset your password." : "Choose a new password."}</h1>
          <p>{mode === "login" ? "One secure identity for shopping, rentals, repairs and commercial access." : mode === "signup" ? "Create one secure SmartCommerce identity for future orders, rentals, repairs, quotes and commercial access." : mode === "forgot" ? "Enter your account email. If an account exists, we’ll send a secure reset link." : "Set a new password. Every existing session will be revoked when the reset succeeds."}</p>
        </div>

        {mode !== "forgot" && mode !== "reset" && <div className="sc-account-real__tabs" role="tablist" aria-label="Customer account"><button type="button" className={mode === "login" ? "is-active" : ""} onClick={() => { setMode("login"); setError(""); setNotice(""); }}><LogIn size={17} /> Sign in</button><button type="button" className={mode === "signup" ? "is-active" : ""} onClick={() => { setMode("signup"); setError(""); setNotice(""); }}><UserRoundPlus size={17} /> Create account</button></div>}

        {mode === "login" && <form className="demo-flow-form sc-account-real__form" onSubmit={handleLogin}><label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label><label>Password<input name="password" type="password" autoComplete="current-password" required maxLength={128} /></label><button type="button" className="sc-account-real__text-action" onClick={() => { setMode("forgot"); setError(""); setNotice(""); }}>Forgot password?</button>{notice && <p role="status" className="sc-account-real__notice">{notice}</p>}{error && <p role="alert" className="sc-account-real__error">{error}</p>}<button disabled={submitting}>{submitting ? "Signing in…" : "Sign in securely"}</button></form>}
        {mode === "signup" && <form className="demo-flow-form sc-account-real__form" onSubmit={handleSignup}><label>Full name<input name="fullName" autoComplete="name" required minLength={2} maxLength={120} /></label><label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label><label>Phone <span>(optional)</span><input name="phone" type="tel" autoComplete="tel" maxLength={40} /></label><label>Password<input name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={128} aria-describedby="sc-password-help" /></label><small id="sc-password-help">Use at least 10 characters. A password manager is recommended.</small><label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={10} maxLength={128} /></label>{notice && <p role="status" className="sc-account-real__notice">{notice}</p>}{error && <p role="alert" className="sc-account-real__error">{error}</p>}<button disabled={submitting}>{submitting ? "Creating account…" : "Create secure account"}</button></form>}
        {mode === "forgot" && <form className="demo-flow-form sc-account-real__form" onSubmit={handleForgotPassword}><label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>{notice && <p role="status" className="sc-account-real__notice">{notice}</p>}{error && <p role="alert" className="sc-account-real__error">{error}</p>}<button disabled={submitting}>{submitting ? "Sending…" : "Send reset link"}</button><button type="button" className="sc-account-real__text-action" onClick={() => { setMode("login"); setError(""); setNotice(""); }}>Back to sign in</button></form>}
        {mode === "reset" && <form className="demo-flow-form sc-account-real__form" onSubmit={handleResetPassword}><label>New password<input name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={128} /></label><label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={10} maxLength={128} /></label>{notice && <p role="status" className="sc-account-real__notice">{notice}</p>}{error && <p role="alert" className="sc-account-real__error">{error}</p>}<button disabled={submitting}>{submitting ? "Updating…" : "Set new password"}</button></form>}
      </Container>
    </div>
  );
}