import { BriefcaseBusiness, CheckCircle2, Loader2 } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import Container from "../components/shared/Container";
import rentalImage from "../assets/services/equipment-rentals.jpg";
import { createSmartCommercePlatformApi } from "../apiClient";
import { routeHref } from "../lib/router";
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
  const providerContext = useMemo(getProviderContext, []);

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
            <p>A direct path for contractors, organisations, facilities, and project buyers who need products, rentals, quotes, or human support.</p>
            <div className="sc-commercial-hero-actions"><a href="#commercial-request">Start a request</a><a href={routeHref("/rentals")}>Plan rentals</a><a href={`https://wa.me/${company.whatsapp.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer">WhatsApp</a></div>
          </div>
          <img src={rentalImage} alt="Professional equipment for commercial projects" />
        </Container>
      </section>
      <Container className="demo-commercial-body sc-commercial-page__body">
        <section>
          <span className="sc-flow-kicker">Commercial support</span>
          <h2>One starting point for bigger requirements.</h2>
          <div className="sc-commercial-capabilities">
            <article><strong>Project and bulk enquiries</strong><p>Describe products, quantities, dates, and site requirements together.</p></article>
            <article><strong>Rental planning</strong><p>Move directly into equipment, dates, branches, and availability.</p></article>
            <article><strong>Provider-backed quote path</strong><p>Structured requests are sent only when the connected provider supports them.</p></article>
            <article><strong>Human assistance</strong><p>Phone, WhatsApp, and email remain visible when a workflow needs a person.</p></article>
          </div>
          <div className="sc-commercial-contact"><strong>Contact Total Tools</strong><a href={`tel:${company.phone.replace(/[^0-9+]/g, "")}`}>{company.phone}</a><a href={`mailto:${company.email}`}>{company.email}</a></div>
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
