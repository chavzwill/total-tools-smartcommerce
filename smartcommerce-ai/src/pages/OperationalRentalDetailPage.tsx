import { CalendarDays, CheckCircle2, Loader2, MapPin, Sparkles, Truck } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import Container from "../components/shared/Container";
import { createRentalReservationWithPlatform, getRentalById } from "../data/rentals";
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

const readQuery = () => {
  const raw = window.location.hash.split("?")[1] || "";
  return new URLSearchParams(raw);
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
  const [reservation, setReservation] = useState<ReservationDraft>({
    startDate: query.get("start") || "",
    endDate: query.get("end") || "",
    branch: query.get("branch") || "",
    fulfillment: (query.get("fulfillment") === "delivery" || query.get("fulfillment") === "pickup" ? query.get("fulfillment") : "unspecified") as FulfillmentMode,
    fullName: "",
    email: "",
    phone: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!foundRental) return <div className="demo-empty"><h1>Rental not found</h1><a href={routeHref("/rentals")}>Return to rental fleet</a></div>;
  const rental = foundRental;

  const rentalDays = daysBetween(reservation.startDate, reservation.endDate);
  const subtotal = rentalDays ? rental.dailyRate * rentalDays : 0;

  async function submitReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (!reservation.startDate || !reservation.endDate || !reservation.branch || reservation.fulfillment === "unspecified") {
      setError("Branch, dates, and pickup or delivery are required before requesting a reservation.");
      return;
    }
    if (reservation.endDate < reservation.startDate) {
      setError("End date must be on or after start date.");
      return;
    }

    setSubmitting(true);
    setError("");
    const result = await createRentalReservationWithPlatform({
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
      setSubmitting(false);
      setError(result.error.message || "The rental request could not be submitted.");
      return;
    }

    go(`/rental-confirmation?item=${encodeURIComponent(rental.id)}&ref=${encodeURIComponent(result.data.id)}&status=${encodeURIComponent(result.data.status)}`);
  }

  return (
    <div className="demo-page rental-detail-next">
      <Container className="rental-detail-next__container">
        <nav className="rental-detail-next__breadcrumbs"><a href={routeHref("/rentals")}>Rentals</a><span>/</span><span>{rental.name}</span></nav>

        <section className="rental-detail-next__hero">
          <div className="rental-detail-next__media"><img src={rental.image} alt={rental.name} /></div>
          <div className="rental-detail-next__summary">
            <small>{rental.category}</small>
            <h1>{rental.name}</h1>
            <p>{rental.description}</p>
            <div className="rental-detail-next__status"><CheckCircle2 size={18} /><div><strong>{rental.availability}</strong><span>{rental.branchAvailability}</span></div></div>
            <div className="rental-detail-next__actions"><a href={routeHref(`/assistant?prompt=${encodeURIComponent(`Is ${rental.name} suitable for my job?`)}`)}><Sparkles size={16} /> Ask about this rental</a></div>
          </div>
        </section>

        <section className="rental-detail-next__grid">
          <article className="rental-detail-next__card">
            <h2>Rates and planning</h2>
            <div className="rental-detail-next__rate-grid">
              <div><span>Daily rate</span><strong>{rental.dailyRate ? money(rental.dailyRate) : "Provider quote"}</strong></div>
              <div><span>Weekly rate</span><strong>{rental.weeklyRate ? money(rental.weeklyRate) : "Provider quote"}</strong></div>
              <div><span>Monthly rate</span><strong>{rental.monthlyRate ? money(rental.monthlyRate) : "Provider quote"}</strong></div>
            </div>
            <div className="rental-detail-next__estimate">
              <div><span>Selected duration</span><strong>{rentalDays ? `${rentalDays} day${rentalDays === 1 ? "" : "s"}` : "Select dates"}</strong></div>
              <div><span>Equipment subtotal</span><strong>{subtotal ? money(subtotal) : "Calculated after dates"}</strong></div>
              <div><span>Delivery</span><strong>Verified by provider</strong></div>
              <div><span>Final availability</span><strong>Verified on submission</strong></div>
            </div>
          </article>

          <article className="rental-detail-next__card">
            <h2>Rental requirements</h2>
            <p><MapPin size={16} /> Choose the branch that should handle the request.</p>
            <p><CalendarDays size={16} /> Dates are sent to the provider as part of the reservation request.</p>
            <p><Truck size={16} /> Pickup or delivery choice is included in the request.</p>
          </article>
        </section>

        <form className="rental-detail-next__reservation" onSubmit={submitReservation}>
          <header><h2>Request reservation</h2><p>This form does not show a success state until the connected provider accepts the request.</p></header>
          <div className="rental-detail-next__reservation-grid">
            <label>Branch<select required value={reservation.branch} onChange={(event) => setReservation((prev) => ({ ...prev, branch: event.target.value }))}><option value="">Select branch</option>{company.branches.map((branch) => <option key={branch.name} value={branch.name}>{branch.name}</option>)}</select></label>
            <label>Start date<input type="date" required value={reservation.startDate} onChange={(event) => setReservation((prev) => ({ ...prev, startDate: event.target.value }))} /></label>
            <label>End date<input type="date" required value={reservation.endDate} onChange={(event) => setReservation((prev) => ({ ...prev, endDate: event.target.value }))} /></label>
            <label>Pickup or delivery<select required value={reservation.fulfillment} onChange={(event) => setReservation((prev) => ({ ...prev, fulfillment: event.target.value as FulfillmentMode }))}><option value="unspecified">Choose</option><option value="pickup">Pickup</option><option value="delivery">Delivery</option></select></label>
            <label>Full name<input required value={reservation.fullName} onChange={(event) => setReservation((prev) => ({ ...prev, fullName: event.target.value }))} /></label>
            <label>Email<input type="email" required value={reservation.email} onChange={(event) => setReservation((prev) => ({ ...prev, email: event.target.value }))} /></label>
            <label>Phone<input required value={reservation.phone} onChange={(event) => setReservation((prev) => ({ ...prev, phone: event.target.value }))} /></label>
          </div>
          {error ? <p className="rental-context-bar__error" role="alert">{error}</p> : null}
          <button type="submit" disabled={submitting}>{submitting ? <><Loader2 size={16} /> Submitting…</> : "Request reservation"}</button>
        </form>
      </Container>
    </div>
  );
}
