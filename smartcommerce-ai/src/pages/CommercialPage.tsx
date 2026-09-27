import { AlertTriangle, BriefcaseBusiness, Building2, CheckCircle2, FolderKanban, Loader2, LockKeyhole, MapPin, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import Container from "../components/shared/Container";
import CommercialTeamPanel from "../components/CommercialTeamPanel";
import { createSmartCommercePlatformApi } from "../apiClient";
import { getCustomerAccount } from "../lib/customerAccount";
import { go, routeHref } from "../lib/router";
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

const SHOPPING_BRANCH_KEY = "smartcommerce_shopping_branch_v1";
const COMMERCIAL_DRAFT_KEY = "smartcommerce_commercial_request_draft_v1";
const MAX_HANDOFF_ITEM_LENGTH = 180;
const MAX_HANDOFF_DETAILS_LENGTH = 700;

type CommercialDraft = {
  businessName: string;
  contactName: string;
  email: string;
  need: string;
  details: string;
  handoffItem?: string;
  handoffDetails?: string;
  handoffQuantity?: number;
  handoffMode?: string;
  handoffBranch?: string;
};

const getProviderContext = () => {
  const businessAccountId = import.meta.env.VITE_SMARTCOMMERCE_BUSINESS_ID;
  const providerId = import.meta.env.VITE_SMARTCOMMERCE_PROVIDER_ID;
  return businessAccountId && providerId ? { businessAccountId, providerId } : undefined;
};

const boundedHandoffText = (value: string | null | undefined, limit: number) =>
  String(value || "").trim().slice(0, limit);

const boundedHandoffQuantity = (value: string | number | null | undefined) => {
  if (typeof value === "number") return Number.isInteger(value) && value >= 1 && value <= 9999 ? value : undefined;
  if (!value || !/^\d{1,4}$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 9999 ? parsed : undefined;
};

const getRequestContext = () => {
  const raw = window.location.hash.split("?")[1] || "";
  const query = new URLSearchParams(raw);
  let branch = "";
  try {
    const stored = window.localStorage.getItem(SHOPPING_BRANCH_KEY) || "";
    branch = company.branches.some((item) => item.name === stored) ? stored : "";
  } catch {
    branch = "";
  }
  return {
    item: boundedHandoffText(query.get("item"), MAX_HANDOFF_ITEM_LENGTH),
    details: boundedHandoffText(query.get("details"), MAX_HANDOFF_DETAILS_LENGTH),
    quantity: boundedHandoffQuantity(query.get("qty")),
    mode: boundedHandoffText(query.get("mode"), 32),
    branch,
  };
};

const getSavedCommercialDraft = (): Partial<CommercialDraft> => {
  try {
    const raw = window.localStorage.getItem(COMMERCIAL_DRAFT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

function verificationLabel(status?: string) {
  if (status === "verified") return "Verified organisation";
  if (status === "pending_review") return "Pending review";
  if (status === "rejected") return "Verification rejected";
  if (status === "suspended") return "Verification suspended";
  return "Organisation not verified";
}

export default function CommercialPage({ quote = false }: { quote?: boolean }) {
  const savedDraft = useMemo(getSavedCommercialDraft, []);
  const requestContext = useMemo(() => {
    const routeContext = getRequestContext();
    return {
      item: routeContext.item || boundedHandoffText(savedDraft.handoffItem, MAX_HANDOFF_ITEM_LENGTH),
      details: routeContext.details || boundedHandoffText(savedDraft.handoffDetails, MAX_HANDOFF_DETAILS_LENGTH),
      quantity: routeContext.quantity ?? boundedHandoffQuantity(savedDraft.handoffQuantity),
      mode: routeContext.mode || boundedHandoffText(savedDraft.handoffMode, 32),
      branch: routeContext.branch || boundedHandoffText(savedDraft.handoffBranch, 120),
    };
  }, [savedDraft]);
  const [businessName, setBusinessName] = useState(() => savedDraft.businessName || "");
  const [contactName, setContactName] = useState(() => savedDraft.contactName || "");
  const [email, setEmail] = useState(() => savedDraft.email || "");
  const [need, setNeed] = useState(() => savedDraft.need || (quote || requestContext.mode === "quote" ? "Bulk product pricing" : requestContext.mode === "maintenance" ? "Project support" : "Project support"));
  const [details, setDetails] = useState(() => savedDraft.details || requestContext.details || (requestContext.item ? `I need commercial support for: ${requestContext.quantity ? `${requestContext.quantity} × ` : ""}${requestContext.item}` : ""));
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [accounts, setAccounts] = useState<CommercialAccountSummary[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [accountDetails, setAccountDetails] = useState<CommercialAccountDetails | null>(null);
  const [accountState, setAccountState] = useState<"loading" | "ready" | "signed-out" | "error">("loading");
  const [workspaceMessage, setWorkspaceMessage] = useState("");
  const [newAccountName, setNewAccountName] = useState("");
  const [newLegalName, setNewLegalName] = useState("");
  const [newRegistrationId, setNewRegistrationId] = useState("");
  const [newTaxId, setNewTaxId] = useState("");
  const [newWorkEmail, setNewWorkEmail] = useState("");
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

  function saveCommercialDraft() {
    const draft: CommercialDraft = {
      businessName,
      contactName,
      email,
      need,
      details,
      handoffItem: requestContext.item || undefined,
      handoffDetails: requestContext.details || undefined,
      handoffQuantity: requestContext.quantity,
      handoffMode: requestContext.mode || undefined,
      handoffBranch: requestContext.branch || undefined,
    };
    try {
      window.localStorage.setItem(COMMERCIAL_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Account onboarding can still continue when local storage is unavailable.
    }
  }

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
      const { details: created } = await createCommercialAccount({
        displayName: newAccountName,
        legalName: newLegalName || newAccountName,
        registrationIdentifier: newRegistrationId,
        taxIdentifier: newTaxId,
        workEmail: newWorkEmail,
        accountType: newAccountType,
      });
      setNewAccountName("");
      setNewLegalName("");
      setNewRegistrationId("");
      setNewTaxId("");
      setNewWorkEmail("");
      await refreshAccount(created.account.id);
      setWorkspaceMessage(newAccountType === "government"
        ? "Government account application submitted for manual verification. No government privileges are active."
        : "Commercial account application submitted. Pricing, credit, purchase-order and account-term privileges remain locked until verification is complete.");
    } catch (error) {
      setWorkspaceMessage(error instanceof Error ? error.message : "Commercial account application could not be submitted.");
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
      setWorkspaceMessage("Job site added as planning information.");
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
      setWorkspaceMessage("Project created as planning information.");
    } catch (error) {
      setWorkspaceMessage(error instanceof Error ? error.message : "Project could not be created.");
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    setMessage("");

    let customerAccountId = "";
    try {
      const accountState = await getCustomerAccount();
      if (!accountState.customer) {
        saveCommercialDraft();
        go("/account?intent=commercial");
        return;
      }
      customerAccountId = accountState.customer.id;
    } catch {
      saveCommercialDraft();
      go("/account?intent=commercial");
      return;
    }

    if (!providerContext) {
      saveCommercialDraft();
      setStatus("error");
      setMessage("Commercial requests are temporarily unavailable online because the Total Tools provider connection is not configured. Your request details are saved; use phone, WhatsApp, or email below for human support.");
      return;
    }

    const api = createSmartCommercePlatformApi({ context: providerContext });
    const result = await api.createCommercialQuote({
      businessAccountId: providerContext.businessAccountId,
      customerAccountId,
      companyName: businessName,
      requestedItems: requestContext.item
        ? [{
            name: requestContext.item,
            ...(requestContext.quantity ? { quantity: requestContext.quantity } : {}),
            notes: "Grounded assistant handoff; customer reviewed the editable commercial request before submission.",
          }]
        : undefined,
      requestDetails: `${need}: ${details}`,
      customerNotes: [
        `Contact: ${contactName} · ${email}`,
        requestContext.branch ? `Shopping branch: ${requestContext.branch}` : "",
        requestContext.item ? `Source item: ${requestContext.item}` : "",
        requestContext.quantity ? `Requested quantity: ${requestContext.quantity}` : "",
        requestContext.details ? "Request context was prefilled from a bounded SmartCommerce AI handoff and remained customer-editable before submission." : "",
      ].filter(Boolean).join("\n"),
    });
    if (!result.success) {
      saveCommercialDraft();
      setStatus("error");
      setMessage(result.error.code === "PLATFORM_CONTEXT_REQUIRED"
        ? "Commercial requests are temporarily unavailable online because the Total Tools provider connection is not configured. Your request details are saved."
        : result.error.message || "The commercial request could not be submitted. Your request details are saved.");
      return;
    }

    try {
      window.localStorage.removeItem(COMMERCIAL_DRAFT_KEY);
    } catch {
      // A successful provider submission must not fail because storage cleanup is unavailable.
    }
    setStatus("success");
    setMessage(`Request ${result.data.id} was accepted with status “${result.data.status}”.`);
  }

  const trust = accountDetails?.account;
  const verified = trust?.verification_status === "verified";

  return (
    <div className="demo-page sc-commercial-page">
      <section className="demo-commercial-page sc-commercial-page__hero">
        <Container>
          <div>
            <span>Total Tools Commercial</span>
            <h1>Products, rentals and project support for the work that cannot wait.</h1>
            <p>Request pricing now, or sign in to manage a verified commercial account, job sites and projects.</p>
            <div className="sc-commercial-hero-actions"><a href="#commercial-request">Request pricing</a><a href="#commercial-account">Commercial account</a><a href={routeHref("/rentals")}>Plan rentals</a></div>
          </div>
        </Container>
      </section>

      <Container className="demo-commercial-body sc-commercial-page__body">
        <form id="commercial-request" className="demo-flow-form sc-commercial-request" onSubmit={submit}>
          <BriefcaseBusiness size={30} />
          <span className="sc-flow-kicker">Commercial request</span>
          <h2>{quote || requestContext.mode === "quote" ? "Request commercial pricing" : "What does the business need?"}</h2>
          {requestContext.item ? <p className="sc-commercial-request__context"><strong>Grounded item:</strong> {requestContext.quantity ? `${requestContext.quantity} × ` : ""}{requestContext.item}</p> : null}
          {requestContext.details ? <p className="sc-commercial-request__context"><strong>SmartCommerce prefill:</strong> Review and edit the requirement below before sending. Nothing has been quoted or submitted yet.</p> : null}
          {requestContext.branch ? <p className="sc-commercial-request__context"><MapPin size={15} /> Shopping from {requestContext.branch}</p> : null}
          <label>Business or organisation<input required value={businessName} onChange={(event) => setBusinessName(event.target.value)} /></label>
          <label>Contact name<input required value={contactName} onChange={(event) => setContactName(event.target.value)} /></label>
          <label>Work email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Business need<select value={need} onChange={(event) => setNeed(event.target.value)}><option>Project support</option><option>Bulk product pricing</option><option>Fleet rentals</option><option>Commercial quote</option><option>Delivery and logistics enquiry</option></select></label>
          <label>Requirement<textarea required value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Products, quantities, site needs, dates, or project context" /></label>
          <button type="submit" disabled={status === "submitting"}>{status === "submitting" ? <><Loader2 size={17} /> Sending request…</> : "Send commercial request"}</button>
          {status === "success" ? <p className="sc-flow-status is-success" role="status"><CheckCircle2 size={16} /> {message}</p> : null}
          {status === "error" ? <p className="sc-flow-status is-error" role="status">{message}</p> : null}
        </form>

        <section id="commercial-account">
          <span className="sc-flow-kicker">Commercial account</span>
          <h2>Apply, verify, then unlock account privileges.</h2>
          {accountState === "loading" ? <p><Loader2 size={16} /> Loading commercial access…</p> : null}
          {accountState === "signed-out" ? <div className="sc-commercial-contact"><strong>Sign in to apply for or manage a commercial account.</strong><a href={routeHref("/account?intent=commercial")}>Sign in or create an account</a></div> : null}
          {accountState === "error" ? <p className="sc-flow-status is-error">Commercial accounts are temporarily unavailable.</p> : null}

          {accountState === "ready" ? <>
            {accounts.length ? <label>Commercial account<select value={selectedAccountId} onChange={(event) => setSelectedAccountId(event.target.value)}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.display_name} · {verificationLabel(account.verification_status)}</option>)}</select></label> : null}

            {accountDetails ? <>
              <div className={`sc-flow-status ${verified ? "is-success" : "is-error"}`} role="status">
                {verified ? <ShieldCheck size={18} /> : <AlertTriangle size={18} />}
                <strong>{verificationLabel(trust?.verification_status)}</strong>
                {!verified ? " — Commercial pricing, credit, purchase orders, charge-to-account and provider terms are locked." : " — Organisation verification is complete."}
              </div>
              <div className="sc-commercial-capabilities">
                <article><Building2 size={22} /><strong>{accountDetails.account.display_name}</strong><p>{accountDetails.account.account_type} · {accountDetails.role} · authority {accountDetails.authorityStatus}</p></article>
                <article><LockKeyhole size={22} /><strong>{accountDetails.account.privilege_status}</strong><p>{accountDetails.privilegedAccess ? "Verified commercial privileges are available." : "Privileged commercial actions remain blocked."}</p></article>
                <article><MapPin size={22} /><strong>{accountDetails.sites.length} job site{accountDetails.sites.length === 1 ? "" : "s"}</strong><p>Planning data only until commercial verification is complete.</p></article>
                <article><FolderKanban size={22} /><strong>{accountDetails.projects.length} project{accountDetails.projects.length === 1 ? "" : "s"}</strong><p>Projects can be organised without granting financial authority.</p></article>
              </div>
            </> : null}

            {!accounts.length ? <form className="demo-flow-form" onSubmit={createAccount}>
              <Building2 size={28} />
              <h3>Apply for a commercial account</h3>
              <p>Selecting an account type does not verify the organisation or activate commercial privileges.</p>
              <label>Trading / display name<input required value={newAccountName} onChange={(event) => setNewAccountName(event.target.value)} /></label>
              <label>Legal organisation name<input required value={newLegalName} onChange={(event) => setNewLegalName(event.target.value)} /></label>
              <label>Registration number<input value={newRegistrationId} onChange={(event) => setNewRegistrationId(event.target.value)} /></label>
              <label>Tax identifier<input value={newTaxId} onChange={(event) => setNewTaxId(event.target.value)} /></label>
              <label>Work email<input type="email" value={newWorkEmail} onChange={(event) => setNewWorkEmail(event.target.value)} /></label>
              <label>Application type<select value={newAccountType} onChange={(event) => setNewAccountType(event.target.value)}><option value="business">Business</option><option value="contractor">Contractor</option><option value="government">Government — manual verification required</option><option value="organisation">Organisation</option></select></label>
              <button type="submit" disabled={workspaceBusy}>{workspaceBusy ? "Submitting…" : "Submit commercial application"}</button>
            </form> : null}

            {accountDetails ? <>
              <div className="sc-commercial-capabilities">
                <form className="demo-flow-form" onSubmit={createSite}>
                  <MapPin size={24} /><h3>Add job site</h3>
                  <label>Site name<input required value={newSiteName} onChange={(event) => setNewSiteName(event.target.value)} placeholder="Kingston warehouse" /></label>
                  <label>City / area<input value={newSiteCity} onChange={(event) => setNewSiteCity(event.target.value)} /></label>
                  <button type="submit" disabled={workspaceBusy}>Add planning site</button>
                </form>
                <form className="demo-flow-form" onSubmit={createProject}>
                  <FolderKanban size={24} /><h3>Create project</h3>
                  <label>Project name<input required value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="Bathroom renovation" /></label>
                  <label>Job site<select value={newProjectSiteId} onChange={(event) => setNewProjectSiteId(event.target.value)}><option value="">No site yet</option>{accountDetails.sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
                  <button type="submit" disabled={workspaceBusy}>Create planning project</button>
                </form>
              </div>
              {accountDetails.projects.length ? <div className="sc-commercial-capabilities">{accountDetails.projects.map((project) => <article key={project.id}><strong>{project.name}</strong><p>{project.reference_code ? `${project.reference_code} · ` : ""}{project.status}</p></article>)}</div> : null}
            </> : null}

            <CommercialTeamPanel accountId={selectedAccountId} onAccepted={refreshAccount} />
            {workspaceMessage ? <p className="sc-flow-status" role="status">{workspaceMessage}</p> : null}
          </> : null}
        </section>

        <section className="sc-commercial-support">
          <span className="sc-flow-kicker">Need a person?</span>
          <h2>Commercial support stays reachable.</h2>
          <p>For verification, complex project requirements, delivery planning or anything the online workflow cannot finish, contact the Total Tools team directly.</p>
          <div className="sc-commercial-contact"><strong>Contact Total Tools</strong><a href={`tel:${company.phone.replace(/[^0-9+]/g, "")}`}>{company.phone}</a><a href={`mailto:${company.email}`}>{company.email}</a><a href={`https://wa.me/${company.whatsapp.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer">WhatsApp</a></div>
        </section>
      </Container>
    </div>
  );
}
