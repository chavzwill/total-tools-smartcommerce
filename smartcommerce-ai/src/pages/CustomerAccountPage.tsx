import { LockKeyhole, LogIn, LogOut, ShieldCheck, UserRound, UserRoundPlus } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import Container from "../components/shared/Container";
import {
  getCustomerAccount,
  loginCustomer,
  logoutCustomer,
  signUpCustomer,
  type CustomerAccount,
} from "../lib/customerAccount";
import { routeHref } from "../lib/router";

type Mode = "login" | "signup";

export default function CustomerAccountPage() {
  const [customer, setCustomer] = useState<CustomerAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<Mode>("login");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getCustomerAccount()
      .then((state) => {
        if (active) setCustomer(state.customer);
      })
      .catch(() => {
        if (active) setError("Customer accounts are temporarily unavailable.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const state = await loginCustomer({
        email: String(form.get("email") || ""),
        password: String(form.get("password") || ""),
      });
      setCustomer(state.customer);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const confirmation = String(form.get("confirmPassword") || "");
    if (password !== confirmation) {
      setError("Passwords do not match.");
      setSubmitting(false);
      return;
    }
    try {
      const state = await signUpCustomer({
        fullName: String(form.get("fullName") || ""),
        email: String(form.get("email") || ""),
        phone: String(form.get("phone") || ""),
        password,
      });
      setCustomer(state.customer);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Account creation failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    setSubmitting(true);
    setError("");
    try {
      await logoutCustomer();
      setCustomer(null);
      setMode("login");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign out failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="demo-page">
        <Container className="demo-account sc-account-real">
          <UserRound size={42} />
          <span>Customer Account</span>
          <h1>Checking your account…</h1>
          <p>Securely verifying your SmartCommerce session.</p>
        </Container>
      </div>
    );
  }

  if (customer) {
    return (
      <div className="demo-page">
        <Container className="demo-account sc-account-real">
          <div className="sc-account-real__identity">
            <UserRound size={42} />
            <div>
              <span>Customer Account</span>
              <h1>Welcome back, {customer.fullName.split(/\s+/)[0]}.</h1>
              <p>{customer.email}{customer.phone ? ` · ${customer.phone}` : ""}</p>
            </div>
          </div>

          <div className="sc-account-real__security">
            <ShieldCheck size={22} />
            <div>
              <strong>Secure session active</strong>
              <span>Your session is stored in an HttpOnly cookie and is not readable by browser JavaScript.</span>
            </div>
          </div>

          <div className="sc-account-real__future">
            <article><strong>Orders</strong><span>Provider-backed order history will appear here when connected.</span></article>
            <article><strong>Rentals</strong><span>Verified rental history will appear here when connected.</span></article>
            <article><strong>Repairs</strong><span>Repair status will appear here when connected.</span></article>
            <article><strong>Commercial</strong><span>Commercial account linkage will appear here when connected.</span></article>
          </div>

          {error && <p role="alert" className="sc-account-real__error">{error}</p>}
          <div className="sc-account-real__actions">
            <a href={routeHref("/products")}>Continue shopping</a>
            <button type="button" disabled={submitting} onClick={handleLogout}><LogOut size={18} /> Sign out</button>
          </div>
        </Container>
      </div>
    );
  }

  return (
    <div className="demo-page">
      <Container className="demo-account sc-account-real sc-account-real--signed-out">
        <div className="sc-account-real__intro">
          <LockKeyhole size={42} />
          <span>SmartCommerce Account</span>
          <h1>{mode === "login" ? "Welcome Back." : "Create Your Account."}</h1>
          <p>{mode === "login" ? "Sign in to continue your shopping, rental, repair, and commercial journeys." : "Create one secure SmartCommerce identity for future orders, rentals, repairs, quotes, and commercial access."}</p>
        </div>

        <div className="sc-account-real__tabs" role="tablist" aria-label="Customer account">
          <button type="button" className={mode === "login" ? "is-active" : ""} onClick={() => { setMode("login"); setError(""); }}><LogIn size={17} /> Sign in</button>
          <button type="button" className={mode === "signup" ? "is-active" : ""} onClick={() => { setMode("signup"); setError(""); }}><UserRoundPlus size={17} /> Create account</button>
        </div>

        {mode === "login" ? (
          <form className="demo-flow-form sc-account-real__form" onSubmit={handleLogin}>
            <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
            <label>Password<input name="password" type="password" autoComplete="current-password" required maxLength={128} /></label>
            {error && <p role="alert" className="sc-account-real__error">{error}</p>}
            <button disabled={submitting}>{submitting ? "Signing in…" : "Sign in securely"}</button>
          </form>
        ) : (
          <form className="demo-flow-form sc-account-real__form" onSubmit={handleSignup}>
            <label>Full name<input name="fullName" autoComplete="name" required minLength={2} maxLength={120} /></label>
            <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
            <label>Phone <span>(optional)</span><input name="phone" type="tel" autoComplete="tel" maxLength={40} /></label>
            <label>Password<input name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={128} aria-describedby="sc-password-help" /></label>
            <small id="sc-password-help">Use at least 10 characters. A password manager is recommended.</small>
            <label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={10} maxLength={128} /></label>
            {error && <p role="alert" className="sc-account-real__error">{error}</p>}
            <button disabled={submitting}>{submitting ? "Creating account…" : "Create secure account"}</button>
          </form>
        )}
      </Container>
    </div>
  );
}
