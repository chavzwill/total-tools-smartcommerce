import { CalendarDays, CheckCircle2, Loader2, MapPin, Sparkles, Truck } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import Container from "../components/shared/Container";
import { createRentalReservationWithPlatform, getRentalById } from "../data/rentals";
import { getCustomerAccount } from "../lib/customerAccount";
import { money } from "../lib/format";
import { go, routeHref } from "../lib/router";
import { company } from "../styles/theme";

type FulfillmentMode = "pickup" | "delivery" | "unspecified";

type ReservationDraft = {
  startDate: string;
  endDate: string;
  branch: string;
  fulfillment: FulfillmentMode;
  fullName: string;
  email: string;
  phone: string;
};

type SavedRentalDraft = {
  rentalId: string;
  reservation: ReservationDraft;
};

const SHOPPING_BRANCH_KEY = "smartcommerce_shopping_branch_v1";
const RENTAL_DRAFT_KEY = "smartcommerce_rental_draft_v1";

const readQuery = () => {
  const raw = window.location.hash.split("?")[1] || "";
  return new URLSearchParams(raw);
};

const preferredPhysicalBranch = () => {
  try {
    const branch = window.localStorage.getItem(SHOPPING_BRANCH_KEY) || "";
    return branch && branch !== "Online" && company.branches.some((item) => item.name === branch) ? branch : "";
  } catch {
    return "";
  }
};

const readSavedRentalDraft = (rentalId: string): ReservationDraft | null => {
  try {
    const raw = window.localStorage.getItem(RENTAL_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedRentalDraft;
    if (!parsed || parsed.rentalId !== rentalId || !parsed.reservation) return null;
    return parsed.reservation;
  } catch {
    return null;
  }
};

const daysBetween = (startDate: string, endDate: string) => {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) return 0;
  return Math.max(0, Math.ceil((end.valueOf() - start.valueOf()) / 86400000) + 1);
};

export default function OperationalRentalDetailPage({ id }: { id: string }) {
  const foundRental = getRentalById(id);
  const query = useMemo(readQuery, []);
  const savedDraft = useMemo(() => readSavedRentalDraft(id), [id]);
  const [reservation, setReservation] = useState<ReservationDraft>(() => savedDraft || {
    startDate: query.get("start") || "",
    endDate: query.get("end") || "",
    branch: query.get("branch") || preferredPhysicalBranch(),
    fulfillment: (query.get("fulfillment") === "delivery" || query.get("fulfillment") === "pickup" ? query.get("fulfillment") : "unspecified") as FulfillmentMode,
    fullName: "",
    email: "",
    phone: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!foundRental) {
    return <div className="demo-empty"><h1>Rental not found</h1><a href={routeHref("/rentals")}>Return to rental fleet</a></div>;
  }
  const rental = foundRental;

  const rentalDays = daysBetween(reservation.startDate, reservation.endDate);
  const subtotal = rentalDays && rental.dailyRate > 0 ? rental.dailyRate * rentalDays : 0;

  function saveDraft() {
    try {
      const draft: SavedRentalDraft = { rentalId: rental.id, reservation };
      window.localStorage.setItem(RENTAL_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Account onboarding can continue even when storage is unavailable.
    }
  }

  async function submitReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (!reservation.startDate || !reservation.endDate || !reservation.branch || reservation.fulfillment === "unspecified") {
      setError("Choose a branch, rental dates, and pickup or delivery before requesting this reservation.");
      return;
    }
    if (reservation.endDate < reservation.startDate) {
      setError("End date must be on or after start date.");
      return;
    }

    setSubmitting(true);
    setError("");

    let customerId = "";
    try {
      const accountState = await getCustomerAccount();
      if (!accountState.customer) {
        saveDraft();
        go("/account?intent=rental");
        return;
      }
      customerId = accountState.customer.id;
    } catch {
      saveDraft();
      go("/account?intent=rental");
      return;
    }

    const result = await createRentalReservationWithPlatform({
      customerAccountId: customerId,
      rentalAssetId: rental.id,
      startDate: new Date(`${reservation.startDate}T12:00:00`).toISOString(),
      endDate: new Date(`${reservation.endDate}T12:00:00`).toISOString(),
      quantity: 1,
      deliveryRequested: reservation.fulfillment === "delivery",
      customerNotes: [
        `Preferred branch: ${reservation.branch}`,
        `Customer: ${reservation.fullName}`,
        `Email: ${reservation.email}`,
        `Phone: ${reservation.phone}`,
        `Fulfillment: ${reservation.fulfillment}`,
      ].join("\n"),
      metadata: { source: "smartcommerce_frontend" },
    });

    if (!result.success) {
      saveDraft();
      setSubmitting(false);
      setError(
        result.error.code === "PLATFORM_CONTEXT_REQUIRED"
          ? "Online rental requests are temporarily unavailable because the Total Tools rental service connection is not configured. Your reservation details are saved."
          : result.error.message || "The rental request could not be submitted.",
      );
      return;
    }

    try {
      window.localStorage.removeItem(RENTAL_DRAFT_KEY);
    } catch {
      // A successful provider request must not fail because local cleanup is unavailable.
    }

    go(`/rental-confirmation?item=${encodeURIComponent(rental.id)}&ref=${encodeURIComponent(result.data.id)}&status=${encodeURIComponent(result.data.status)}`);
  }

  return (
    <div className="demo-page rental-detail-next">
      <Container className="rental-detail-next__container">
        <nav className="rental-detail-next__breadcrumbs">
          <a href={routeHref("/rentals")}>Rentals</a><span>/</span><span>{rental.name}</span>
        </nav>

        <section className="rental-detail-next__hero">
          <div className="rental-detail-next__media"><img src={rental.image} alt={rental.name} /></div>
          <div className="rental-detail-next__summary">
            <small>{rental.category}</small>
            <h1>{rental.name}</h1>
            <p>{rental.description}</p>

            <div className="rental-detail-next__status">
              <CheckCircle2 size={18} />
              <div><strong>{rental.availability}</strong><span>{rental.branchAvailability}</span></div>
            </div>

            <div className="rental-detail-next__rate-grid" aria-label={`Rental rates for ${rental.name}`}>
              <div><span>Daily</span><strong>{rental.dailyRate ? money(rental.dailyRate) : "Confirm rate"}</strong></div>
              <div><span>Weekly</span><strong>{rental.weeklyRate ? money(rental.weeklyRate) : "Confirm rate"}</strong></div>
              <div><span>Monthly</span><strong>{rental.monthlyRate ? money(rental.monthlyRate) : "Confirm rate"}</strong></div>
            </div>

            <div className="rental-detail-next__actions">
              <a className="rental-detail-next__reserve-link" href="#rental-reservation"><CalendarDays size={16} /> Reserve this equipment</a>
              <a href={routeHref(`/assistant?prompt=${encodeURIComponent(`Is ${rental.name} suitable for my job?`)}`)}><Sparkles size={16} /> Ask SmartCommerce</a>
            </div>
          </div>
        </section>

        <form id="rental-reservation" className="rental-detail-next__reservation" onSubmit={submitReservation}>
          <header>
            <span>Reservation</span>
            <h2>Choose the details for your job.</h2>
            <p>We only show a confirmation after the rental request is accepted.</p>
          </header>

          <div className="rental-detail-next__reservation-grid">
            <label>Branch<select required value={reservation.branch} onChange={(event) => setReservation((prev) => ({ ...prev, branch: event.target.value }))}><option value="">Select branch</option>{company.branches.map((branch) => <option key={branch.name} value={branch.name}>{branch.name}</option>)}</select></label>
            <label>Start date<input type="date" required value={reservation.startDate} onChange={(event) => setReservation((prev) => ({ ...prev, startDate: event.target.value }))} /></label>
            <label>End date<input type="date" required value={reservation.endDate} onChange={(event) => setReservation((prev) => ({ ...prev, endDate: event.target.value }))} /></label>
            <label>Pickup or delivery<select required value={reservation.fulfillment} onChange={(event) => setReservation((prev) => ({ ...prev, fulfillment: event.target.value as FulfillmentMode }))}><option value="unspecified">Choose</option><option value="pickup">Pickup</option><option value="delivery">Delivery</option></select></label>
            <label>Full name<input autoComplete="name" required value={reservation.fullName} onChange={(event) => setReservation((prev) => ({ ...prev, fullName: event.target.value }))} /></label>
            <label>Email<input autoComplete="email" type="email" required value={reservation.email} onChange={(event) => setReservation((prev) => ({ ...prev, email: event.target.value }))} /></label>
            <label>Phone<input autoComplete="tel" inputMode="tel" required value={reservation.phone} onChange={(event) => setReservation((prev) => ({ ...prev, phone: event.target.value }))} /></label>
          </div>

          <div className="rental-detail-next__estimate">
            <div><span>Duration</span><strong>{rentalDays ? `${rentalDays} day${rentalDays === 1 ? "" : "s"}` : "Select dates"}</strong></div>
            <div><span>Equipment estimate</span><strong>{subtotal ? money(subtotal) : "Calculated from dates"}</strong></div>
            <div><span>Fulfillment</span><strong>{reservation.fulfillment === "unspecified" ? "Choose pickup or delivery" : reservation.fulfillment === "delivery" ? "Delivery" : "Pickup"}</strong></div>
            <div><span>Availability</span><strong>Confirmed on request</strong></div>
          </div>

          {error ? <p className="rental-context-bar__error" role="alert">{error}</p> : null}
          <button type="submit" disabled={submitting}>{submitting ? <><Loader2 size={16} /> Submitting…</> : "Request reservation"}</button>
        </form>

        <section className="rental-detail-next__grid rental-detail-next__supporting">
          <article className="rental-detail-next__card">
            <h2>Before you reserve</h2>
            <p><MapPin size={16} /> Your selected branch handles the request.</p>
            <p><CalendarDays size={16} /> Dates are used to confirm equipment availability.</p>
            <p><Truck size={16} /> Pickup or delivery is included with the request.</p>
          </article>

          <article className="rental-detail-next__card">
            <h2>Need help choosing?</h2>
            <p>Not sure this machine is right for the site, load, reach, or job? Ask SmartCommerce before you reserve.</p>
            <a href={routeHref(`/assistant?prompt=${encodeURIComponent(`Compare ${rental.name} with the best rental alternatives for my job`)}`)}><Sparkles size={16} /> Compare alternatives with AI</a>
          </article>
        </section>
      </Container>
    </div>
  );
}
