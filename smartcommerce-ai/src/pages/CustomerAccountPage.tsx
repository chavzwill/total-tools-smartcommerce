import { BadgeCheck, BriefcaseBusiness, KeyRound, LockKeyhole, LogIn, LogOut, MailCheck, PackageCheck, ShieldCheck, UserRound, UserRoundPlus, Wrench } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import Container from "../components/shared/Container";
import AccountPasskeyPanel from "../components/account/AccountPasskeyPanel";
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

export default function CustomerAccountPage() {
  const [customer, setCustomer] = useState<CustomerAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<Mode>("login");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resetToken, setResetToken] = useState("");

  useEffect(() => {
    let active = true;
    const query = getRoute().query;
    const verifyToken = query.get("verify") || "";
    const passwordResetToken = query.get("reset") || "";
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

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true); setError(""); setNotice(""); const form = new FormData(event.currentTarget);
    try { const state = await loginCustomer({ email: String(form.get("email") || ""), password: String(form.get("password") || "") }); setCustomer(state.customer); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Sign in failed."); }
    finally { setSubmitting(false); }
  }

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true); setError(""); setNotice(""); const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || ""), confirmation = String(form.get("confirmPassword") || "");
    if (password !== confirmation) { setError("Passwords do not match."); setSubmitting(false); return; }
    try {
      const state = await signUpCustomer({ fullName: String(form.get("fullName") || ""), email: String(form.get("email") || ""), phone: String(form.get("phone") || ""), password });
      setCustomer(state.customer); setNotice("Account created. Verify your email to complete your account security setup.");
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
    try { await logoutCustomer(); setCustomer(null); setMode("login"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Sign out failed."); }
    finally { setSubmitting(false); }
  }

  if (loading) return <div className="demo-page"><Container className="demo-account sc-account-real"><UserRound size={42} /><span>Customer Account</span><h1>Checking your account…</h1><p>Securely verifying your SmartCommerce session.</p></Container></div>;

  if (customer && mode !== "reset") {
    const firstName = customer.fullName.split(/\s+/)[0];
    return (
      <div className="demo-page sc-account-page">
        <Container className="demo-account sc-account-real sc-account-dashboard">
          <header className="sc-account-hero">
            <div className="sc-account-avatar" aria-hidden="true">{firstName.slice(0, 1).toUpperCase()}</div>
            <div className="sc-account-hero__copy">
              <span className="sc-eyebrow">SmartCommerce account</span>
              <h1>Good to see you, {firstName}.</h1>
              <p>{customer.email}{customer.phone ? ` · ${customer.phone}` : ""}</p>
            </div>
            <button className="sc-signout-button" type="button" disabled={submitting} onClick={handleLogout}><LogOut size={17} /> Sign out</button>
          </header>

          <div className="sc-account-summary">
            <article><div className="sc-summary-icon"><ShieldCheck size={20} /></div><div><span>Session</span><strong>Protected</strong><small>HttpOnly secure session</small></div></article>
            <article><div className="sc-summary-icon"><MailCheck size={20} /></div><div><span>Email</span><strong>{customer.emailVerified ? "Verified" : "Action needed"}</strong><small>{customer.emailVerified ? "Identity confirmed" : "Verification required"}</small></div></article>
            <article><div className="sc-summary-icon"><BadgeCheck size={20} /></div><div><span>Security</span><strong>Security center</strong><small>Passkeys, MFA & sessions</small></div></article>
          </div>

          {!customer.emailVerified && <section className="sc-account-alert"><MailCheck size={21} /><div><strong>Verify your email to unlock sensitive features</strong><span>We use email verification before enabling stronger security and commercial account controls.</span></div><button type="button" disabled={submitting} onClick={handleVerificationRequest}>{submitting ? "Sending…" : "Send verification email"}</button></section>}

          <section className="sc-account-section">
            <div className="sc-account-section__heading"><span className="sc-eyebrow">Security center</span><h2>Protect your account</h2><p>Manage the methods SmartCommerce can use to verify that it is really you.</p></div>
            {customer.emailVerified ? <AccountPasskeyPanel /> : <div className="sc-empty-state">Verify your email to configure passkeys, authenticator MFA and session controls.</div>}
          </section>

          <section className="sc-account-section">
            <div className="sc-account-section__heading"><span className="sc-eyebrow">Your activity</span><h2>Everything in one place</h2><p>Your account becomes the secure home for purchases, rentals, repairs and commercial access as each service connects.</p></div>
            <div className="sc-account-services">
              <article><div className="sc-service-icon"><PackageCheck size={20} /></div><div><strong>Orders</strong><span>Purchases, fulfilment and order history.</span></div><em>Coming online</em></article>
              <article><div className="sc-service-icon"><BriefcaseBusiness size={20} /></div><div><strong>Rentals</strong><span>Rental agreements, extensions and returns.</span></div><em>Coming online</em></article>
              <article><div className="sc-service-icon"><Wrench size={20} /></div><div><strong>Repairs</strong><span>Repair status, approvals and service history.</span></div><em>Coming online</em></article>
              <article><div className="sc-service-icon"><BadgeCheck size={20} /></div><div><strong>Commercial</strong><span>Business verification, credit and purchasing controls.</span></div><em>Restricted</em></article>
            </div>
          </section>

          {notice && <p role="status" className="sc-account-real__notice">{notice}</p>}
          {error && <p role="alert" className="sc-account-real__error">{error}</p>}
          <div className="sc-account-real__actions"><a href={routeHref("/products")}>Continue shopping</a></div>
        </Container>
      </div>
    );
  }

  return (
    <div className="demo-page sc-account-page">
      <Container className="demo-account sc-account-real sc-account-real--signed-out">
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
