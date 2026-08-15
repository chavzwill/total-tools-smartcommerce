import { BriefcaseBusiness, Building2, CheckCircle2, FolderKanban, Loader2, MapPin } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import Container from "../components/shared/Container";
import rentalImage from "../assets/services/equipment-rentals.jpg";
import { createSmartCommercePlatformApi } from "../apiClient";
import { routeHref } from "../lib/router";
import {
  createCommercialAccount,
  createCommercialProject,
  createCommercialSite,
  getCommercialAccount,
  listCommercialAccounts,
  type CommercialAccountDetails,
  type CommercialAccountSummary,
} from "../services/commercialAccountClient";
import { company } from "../styles/theme";

const getProviderContext = () => {
  const businessAccountId = import.meta.env.VITE_SMARTCOMMERCE_BUSINESS_ID;
  const providerId = import.meta.env.VITE_SMARTCOMMERCE_PROVIDER_ID;
  return businessAccountId && providerId ? { businessAccountId, providerId } : undefined;
};

export default function CommercialPage({ quote = false }: { quote?: boolean }) {
  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [need, setNeed] = useState(quote ? "Bulk product pricing" : "Project support");
  const [details, setDetails] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [accounts, setAccounts] = useState<CommercialAccountSummary[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [accountDetails, setAccountDetails] = useState<CommercialAccountDetails | null>(null);
  const [accountState, setAccountState] = useState<"loading" | "ready" | "signed-out" | "error">("loading");
  const [workspaceMessage, setWorkspaceMessage] = useState("");
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountType, setNewAccountType] = useState("business");
  const [newSiteName, setNewSiteName] = useState("");
  const [newSiteCity, setNewSiteCity] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectSiteId, setNewProjectSiteId] = useState("");
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const providerContext = useMemo(getProviderContext, []);

  useEffect(() => {
    let cancelled = false;
    listCommercialAccounts()
      .then(({ accounts: found }) => {
        if (cancelled) return;
        setAccounts(found);
        setAccountState("ready");
        if (found[0]) setSelectedAccountId(found[0].id);
      })
      .catch((error: Error & { status?: number }) => {
        if (cancelled) return;
        setAccountState(error.status === 401 ? "signed-out" : "error");
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedAccountId) {
      setAccountDetails(null);
      return;
    }
    getCommercialAccount(selectedAccountId)
      .then(({ details: value }) => setAccountDetails(value))
      .catch((error: Error) => setWorkspaceMessage(error.message));
  }, [selectedAccountId]);

  async function refreshAccount(accountId: string) {
    const [{ accounts: found }, { details: refreshed }] = await Promise.all([
      listCommercialAccounts(),
      getCommercialAccount(accountId),
    ]);
    setAccounts(found);
    setSelectedAccountId(accountId);
    setAccountDetails(refreshed);
  }

  async function createAccount(event: FormEvent) {
    event.preventDefault();
    setWorkspaceBusy(true);
    setWorkspaceMessage("");
    try {
      const { details: created } = await createCommercialAccount({ displayName: newAccountName, accountType: newAccountType });
      setNewAccountName("");
      await refreshAccount(created.account.id);
      setWorkspaceMessage("Commercial account created. Provider verification is still required before account-specific pricing or terms can appear.");
    } catch (error) {
      setWorkspaceMessage(error instanceof Error ? error.message : "Commercial account could not be created.");
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function createSite(event: FormEvent) {
    event.preventDefault();
    if (!selectedAccountId) return;
    setWorkspaceBusy(true);
    setWorkspaceMessage("");
    try {
      const { details: refreshed } = await createCommercialSite({ accountId: selectedAccountId, name: newSiteName, city: newSiteCity });
      setAccountDetails(refreshed);
      setNewSiteName("");
      setNewSiteCity("");
      setWorkspaceMessage("Job site added.");
    } catch (error) {
      setWorkspaceMessage(error instanceof Error ? error.message : "Job site could not be added.");
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function createProject(event: FormEvent) {
    event.preventDefault();
    if (!selectedAccountId) return;
    setWorkspaceBusy(true);
    setWorkspaceMessage("");
    try {
      const { details: refreshed } = await createCommercialProject({ accountId: selectedAccountId, name: newProjectName, siteId: newProjectSiteId || undefined });
      setAccountDetails(refreshed);
      setNewProjectName("");
      setNewProjectSiteId("");
      setWorkspaceMessage("Project created.");
    } catch (error) {
      setWorkspaceMessage(error instanceof Error ? error.message : "Project could not be created.");
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!providerContext) {
      setStatus("error");
      setMessage("A connected provider is required before SmartCommerce can submit this request. Use phone, WhatsApp, or email below for human support.");
      return;
    }
    setStatus("submitting");
    const api = createSmartCommercePlatformApi({ context: providerContext });
    const result = await api.createCommercialQuote({
      businessAccountId: providerContext.businessAccountId,
      customerAccountId: undefined,
      companyName: businessName,
      requestDetails: `${need}: ${details}`,
      customerNotes: `Contact: ${contactName} · ${email}`,
    });
    if (!result.success) {
      setStatus("error");
      setMessage(result.error.message);
      return;
    }
    setStatus("success");
    setMessage(`Request ${result.data.id} was accepted with status “${result.data.status}”.`);
  }

  return (
    <div className="demo-page sc-commercial-page">
      <section className="demo-commercial-page sc-commercial-page__hero">
        <Container>
          <div>
            <span>Total Tools Commercial</span>
            <h1>Move the whole project, not just one item.</h1>
            <p>Run business purchasing, projects, rentals, quotes, and job-site planning from one commercial workspace.</p>
            <div className="sc-commercial-hero-actions"><a href="#commercial-account">Commercial account</a><a href="#commercial-request">Request a quote</a><a href={routeHref("/rentals")}>Plan rentals</a></div>
          </div>
          <img src={rentalImage} alt="Professional equipment for commercial projects" />
        </Container>
      </section>

      <Container className="demo-commercial-body sc-commercial-page__body">
        <section id="commercial-account">
          <span className="sc-flow-kicker">Commercial workspace</span>
          <h2>Your business, projects and buying team.</h2>
          {accountState === "loading" ? <p><Loader2 size={16} /> Loading commercial access…</p> : null}
          {accountState === "signed-out" ? <div className="sc-commercial-contact"><strong>Sign in to manage a commercial account.</strong><a href={routeHref("/account")}>Sign in or create an account</a></div> : null}
          {accountState === "error" ? <p className="sc-flow-status is-error">Commercial accounts are temporarily unavailable.</p> : null}

          {accountState === "ready" ? <>
            {accounts.length ? <label>Commercial account<select value={selectedAccountId} onChange={(event) => setSelectedAccountId(event.target.value)}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.display_name} · {account.role}</option>)}</select></label> : null}

            {accountDetails ? <div className="sc-commercial-capabilities">
              <article><Building2 size={22} /><strong>{accountDetails.account.display_name}</strong><p>{accountDetails.account.account_type} · {accountDetails.role} · {accountDetails.account.status}</p></article>
              <article><MapPin size={22} /><strong>{accountDetails.sites.length} job site{accountDetails.sites.length === 1 ? "" : "s"}</strong><p>Saved delivery and project locations.</p></article>
              <article><FolderKanban size={22} /><strong>{accountDetails.projects.length} project{accountDetails.projects.length === 1 ? "" : "s"}</strong><p>Organise quotes, products, rentals and deliveries by job.</p></article>
              <article><BriefcaseBusiness size={22} /><strong>{accountDetails.members.length} member{accountDetails.members.length === 1 ? "" : "s"}</strong><p>Roles are enforced server-side. Provider pricing and terms remain unavailable until verified.</p></article>
            </div> : null}

            {!accounts.length ? <form className="demo-flow-form" onSubmit={createAccount}>
              <Building2 size={28} />
              <h3>Create a commercial account</h3>
              <label>Business or organisation name<input required value={newAccountName} onChange={(event) => setNewAccountName(event.target.value)} /></label>
              <label>Account type<select value={newAccountType} onChange={(event) => setNewAccountType(event.target.value)}><option value="business">Business</option><option value="contractor">Contractor</option><option value="government">Government</option><option value="organisation">Organisation</option></select></label>
              <button type="submit" disabled={workspaceBusy}>{workspaceBusy ? "Creating…" : "Create commercial account"}</button>
            </form> : null}

            {accountDetails ? <>
              <div className="sc-commercial-capabilities">
                <form className="demo-flow-form" onSubmit={createSite}>
                  <MapPin size={24} /><h3>Add job site</h3>
                  <label>Site name<input required value={newSiteName} onChange={(event) => setNewSiteName(event.target.value)} placeholder="Kingston warehouse" /></label>
                  <label>City / area<input value={newSiteCity} onChange={(event) => setNewSiteCity(event.target.value)} /></label>
                  <button type="submit" disabled={workspaceBusy}>Add site</button>
                </form>
                <form className="demo-flow-form" onSubmit={createProject}>
                  <FolderKanban size={24} /><h3>Create project</h3>
                  <label>Project name<input required value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="Bathroom renovation" /></label>
                  <label>Job site<select value={newProjectSiteId} onChange={(event) => setNewProjectSiteId(event.target.value)}><option value="">No site yet</option>{accountDetails.sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
                  <button type="submit" disabled={workspaceBusy}>Create project</button>
                </form>
              </div>
              {accountDetails.projects.length ? <div className="sc-commercial-capabilities">{accountDetails.projects.map((project) => <article key={project.id}><strong>{project.name}</strong><p>{project.reference_code ? `${project.reference_code} · ` : ""}{project.status}</p></article>)}</div> : null}
            </> : null}

            {workspaceMessage ? <p className="sc-flow-status" role="status">{workspaceMessage}</p> : null}
          </> : null}
        </section>

        <section>
          <span className="sc-flow-kicker">Commercial support</span>
          <h2>Need pricing or project support now?</h2>
          <div className="sc-commercial-capabilities">
            <article><strong>Project and bulk enquiries</strong><p>Describe products, quantities, dates, and site requirements together.</p></article>
            <article><strong>Rental planning</strong><p>Move directly into equipment, dates, branches, and availability.</p></article>
            <article><strong>Provider-backed quote path</strong><p>Structured requests are sent only when the connected provider supports them.</p></article>
            <article><strong>Human assistance</strong><p>Phone, WhatsApp, and email remain visible when a workflow needs a person.</p></article>
          </div>
          <div className="sc-commercial-contact"><strong>Contact Total Tools</strong><a href={`tel:${company.phone.replace(/[^0-9+]/g, "")}`}>{company.phone}</a><a href={`mailto:${company.email}`}>{company.email}</a><a href={`https://wa.me/${company.whatsapp.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer">WhatsApp</a></div>
        </section>

        <form id="commercial-request" className="demo-flow-form" onSubmit={submit}>
          <BriefcaseBusiness size={30} />
          <h2>{quote ? "Request commercial pricing" : "Tell us what the business needs"}</h2>
          <label>Business name<input required value={businessName} onChange={(event) => setBusinessName(event.target.value)} /></label>
          <label>Contact name<input required value={contactName} onChange={(event) => setContactName(event.target.value)} /></label>
          <label>Work email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Business need<select value={need} onChange={(event) => setNeed(event.target.value)}><option>Project support</option><option>Bulk product pricing</option><option>Fleet rentals</option><option>Commercial quote</option><option>Delivery and logistics enquiry</option></select></label>
          <label>Requirement<textarea required value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Products, quantities, site needs, dates, or project context" /></label>
          <button type="submit" disabled={status === "submitting"}>{status === "submitting" ? <><Loader2 size={17} /> Submitting…</> : "Send commercial request"}</button>
          {status === "success" ? <p className="sc-flow-status is-success" role="status"><CheckCircle2 size={16} /> {message}</p> : null}
          {status === "error" ? <p className="sc-flow-status is-error" role="status">{message}</p> : null}
        </form>
      </Container>
    </div>
  );
}
