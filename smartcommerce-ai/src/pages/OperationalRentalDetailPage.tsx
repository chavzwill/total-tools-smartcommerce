import { BatteryCharging, CalendarDays, CheckCircle2, HardHat, Loader2, MapPin, PackagePlus, Sparkles, Truck } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import Container from "../components/shared/Container";
import { createRentalReservationWithPlatform, getRentalById } from "../data/rentals";
import { getCustomerAccount } from "../lib/customerAccount";
import { money } from "../lib/format";
import { go, routeHref } from "../lib/router";
import { trackCustomerRental } from "../services/customerRentalsClient";
import { company } from "../styles/theme";
import type { RentalAddOn } from "../types";
import "../styles/rental-addons.css";

type FulfillmentMode = "pickup" | "delivery" | "unspecified";
type SelectedAddOn = { id: string; quantity: number };

type ReservationDraft = {
  startDate: string;
  endDate: string;
  branch: string;
  fulfillment: FulfillmentMode;
  fullName: string;
  email: string;
  phone: string;
  addOns: SelectedAddOn[];
};

type SavedRentalDraft = {
  rentalId: string;
  reservation: ReservationDraft;
};

const SHOPPING_BRANCH_KEY = "smartcommerce_shopping_branch_v1";
const RENTAL_DRAFT_KEY = "smartcommerce_rental_draft_v1";

const readQuery = () => new URLSearchParams(window.location.hash.split("?")[1] || "");

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
    return { ...parsed.reservation, addOns: Array.isArray(parsed.reservation.addOns) ? parsed.reservation.addOns : [] };
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

function inferredRequestAddOns(name: string, category: string, specs: Record<string, string>): RentalAddOn[] {
  const haystack = `${name} ${category} ${Object.values(specs).join(" ")}`.toLowerCase();
  const addOns: RentalAddOn[] = [];

  if (/battery|cordless|electric/.test(haystack)) {
    addOns.push(
      { id: "extra-battery", name: "Extra battery", description: "Add backup runtime for the job.", category: "battery_power", rateBasis: "provider_quote", maximumQuantity: 4, availability: "requires_confirmation" },
      { id: "extra-charger", name: "Additional charger", description: "Request another compatible charger.", category: "battery_power", rateBasis: "provider_quote", maximumQuantity: 2, availability: "requires_confirmation" },
    );
  }

  if (/excavator|backhoe|forklift|telehandler|roller|skid|loader|boom lift|scissor lift/.test(haystack)) {
    addOns.push({ id: "operator-service", name: "Qualified operator", description: "Request an operator with the equipment. Schedule and rate are confirmed with the reservation.", category: "operator", rateBasis: "provider_quote", maximumQuantity: 1, availability: "requires_confirmation", scheduleRequired: true });
  }

  if (/excavator|backhoe|skid|loader|telehandler/.test(haystack)) {
    addOns.push({ id: "attachment-request", name: "Additional attachment", description: "Request a compatible bucket, fork, auger or other job attachment. Compatibility is verified before confirmation.", category: "attachment", rateBasis: "provider_quote", maximumQuantity: 3, availability: "requires_confirmation" });
  }

  return addOns;
}

function addOnIcon(addOn: RentalAddOn) {
  if (addOn.category === "operator") return <HardHat size={20} aria-hidden="true" />;
  if (addOn.category === "battery_power") return <BatteryCharging size={20} aria-hidden="true" />;
  return <PackagePlus size={20} aria-hidden="true" />;
}

export default function OperationalRentalDetailPage({ id }: { id: string }) {
  const foundRental = getRentalById(id);
  const query = useMemo(readQuery, []);
  const extensionOf = query.get("extensionOf") || "";
  const savedDraft = useMemo(() => readSavedRentalDraft(id), [id]);
  const [reservation, setReservation] = useState<ReservationDraft>(() => savedDraft || {
    startDate: query.get("start") || "",
    endDate: query.get("end") || "",
    branch: query.get("branch") || preferredPhysicalBranch(),
    fulfillment: (query.get("fulfillment") === "delivery" || query.get("fulfillment") === "pickup" ? query.get("fulfillment") : "unspecified") as FulfillmentMode,
    fullName: "",
    email: "",
    phone: "",
    addOns: [],
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!foundRental) return <div className="demo-empty"><h1>Rental not found</h1><a href={routeHref("/rentals")}>Return to rental fleet</a></div>;
  const rental = foundRental;
  const availableAddOns = rental.addOns?.length ? rental.addOns : inferredRequestAddOns(rental.name, rental.category, rental.specs);
  const rentalDays = daysBetween(reservation.startDate, reservation.endDate);
  const subtotal = rentalDays && rental.dailyRate > 0 ? rental.dailyRate * rentalDays : 0;

  function saveDraft() {
    try { window.localStorage.setItem(RENTAL_DRAFT_KEY, JSON.stringify({ rentalId: rental.id, reservation } satisfies SavedRentalDraft)); } catch { /* non-blocking */ }
  }

  function toggleAddOn(addOn: RentalAddOn) {
    setReservation((prev) => {
      const exists = prev.addOns.some((item) => item.id === addOn.id);
      return { ...prev, addOns: exists ? prev.addOns.filter((item) => item.id !== addOn.id) : [...prev.addOns, { id: addOn.id, quantity: Math.max(1, addOn.minimumQuantity || 1) }] };
    });
  }

  function setAddOnQuantity(addOn: RentalAddOn, quantity: number) {
    const minimum = Math.max(1, addOn.minimumQuantity || 1);
    const maximum = Math.max(minimum, addOn.maximumQuantity || 99);
    const next = Math.max(minimum, Math.min(maximum, Math.trunc(quantity || minimum)));
    setReservation((prev) => ({ ...prev, addOns: prev.addOns.map((item) => item.id === addOn.id ? { ...item, quantity: next } : item) }));
  }

  async function submitReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (!reservation.startDate || !reservation.endDate || !reservation.branch || reservation.fulfillment === "unspecified") {
      setError("Choose a branch, rental dates, and pickup or delivery before requesting this reservation.");
      return;
    }
    if (reservation.endDate < reservation.startDate) { setError("End date must be on or after start date."); return; }

    setSubmitting(true); setError("");
    let customerId = "";
    try {
      const accountState = await getCustomerAccount();
      if (!accountState.customer) { saveDraft(); go("/account?intent=rental"); return; }
      customerId = accountState.customer.id;
    } catch { saveDraft(); go("/account?intent=rental"); return; }

    const selectedAddOns = reservation.addOns.map((selection) => {
      const addOn = availableAddOns.find((item) => item.id === selection.id);
      return addOn ? { id: addOn.id, name: addOn.name, category: addOn.category, quantity: selection.quantity, rateBasis: addOn.rateBasis, unitPrice: addOn.unitPrice ?? null, currency: addOn.currency ?? null, availability: addOn.availability ?? "requires_confirmation", scheduleRequired: Boolean(addOn.scheduleRequired) } : null;
    }).filter(Boolean);

    const startAt = new Date(`${reservation.startDate}T12:00:00`).toISOString();
    const endAt = new Date(`${reservation.endDate}T12:00:00`).toISOString();
    const result = await createRentalReservationWithPlatform({
      customerAccountId: customerId,
      rentalAssetId: rental.id,
      startDate: startAt,
      endDate: endAt,
      quantity: 1,
      deliveryRequested: reservation.fulfillment === "delivery",
      customerNotes: [
        extensionOf ? `Extension of reservation: ${extensionOf}` : "",
        `Preferred branch: ${reservation.branch}`,
        `Customer: ${reservation.fullName}`,
        `Email: ${reservation.email}`,
        `Phone: ${reservation.phone}`,
        `Fulfillment: ${reservation.fulfillment}`,
        selectedAddOns.length ? `Requested add-ons: ${selectedAddOns.map((item: any) => `${item.name} x${item.quantity}`).join(", ")}` : "",
      ].filter(Boolean).join("\n"),
      metadata: {
        source: "smartcommerce_frontend",
        rental_add_ons_json: JSON.stringify(selectedAddOns),
        rental_add_ons_count: selectedAddOns.length,
        rental_extension_of: extensionOf || null,
      },
    });

    if (!result.success) {
      saveDraft(); setSubmitting(false);
      setError(result.error.code === "PLATFORM_CONTEXT_REQUIRED" ? "Online rental requests are temporarily unavailable because the Total Tools rental service connection is not configured. Your reservation details are saved." : result.error.message || "The rental request could not be submitted.");
      return;
    }

    await trackCustomerRental({
      customerId,
      providerReservationId: result.data.id,
      rentalAssetId: rental.id,
      equipmentName: rental.name,
      branch: reservation.branch,
      startAt,
      endAt,
      status: result.data.status,
      fulfillment: reservation.fulfillment,
      addOns: selectedAddOns as unknown[],
      extensionOfReservationId: extensionOf || undefined,
    }).catch(() => undefined);

    try { window.localStorage.removeItem(RENTAL_DRAFT_KEY); } catch { /* non-blocking */ }
    go(`/rental-confirmation?item=${encodeURIComponent(rental.id)}&ref=${encodeURIComponent(result.data.id)}&status=${encodeURIComponent(result.data.status)}${extensionOf ? "&extension=1" : ""}`);
  }

  return (
    <div className="demo-page rental-detail-next">
      <Container className="rental-detail-next__container">
        <nav className="rental-detail-next__breadcrumbs"><a href={routeHref("/rentals")}>Rentals</a><span>/</span><span>{rental.name}</span></nav>

        <section className="rental-detail-next__hero">
          <div className="rental-detail-next__media"><img src={rental.image} alt={rental.name} /></div>
          <div className="rental-detail-next__summary">
            <small>{rental.category}</small><h1>{rental.name}</h1><p>{rental.description}</p>
            <div className="rental-detail-next__status"><CheckCircle2 size={18} /><div><strong>{rental.availability}</strong><span>{rental.branchAvailability}</span></div></div>
            <div className="rental-detail-next__rate-grid" aria-label={`Rental rates for ${rental.name}`}>
              <div><span>Daily</span><strong>{rental.dailyRate ? money(rental.dailyRate) : "Confirm rate"}</strong></div>
              <div><span>Weekly</span><strong>{rental.weeklyRate ? money(rental.weeklyRate) : "Confirm rate"}</strong></div>
              <div><span>Monthly</span><strong>{rental.monthlyRate ? money(rental.monthlyRate) : "Confirm rate"}</strong></div>
            </div>
            <div className="rental-detail-next__actions"><a className="rental-detail-next__reserve-link" href="#rental-reservation"><CalendarDays size={16} /> {extensionOf ? "Extend this rental" : "Reserve this equipment"}</a><a href={routeHref(`/assistant?prompt=${encodeURIComponent(`Is ${rental.name} suitable for my job?`)}`)}><Sparkles size={16} /> Ask SmartCommerce</a></div>
          </div>
        </section>

        <form id="rental-reservation" className="rental-detail-next__reservation" onSubmit={submitReservation}>
          <header><span>{extensionOf ? "Rental extension" : "Reservation"}</span><h2>{extensionOf ? "Choose the new return period." : "Choose the details for your job."}</h2><p>{extensionOf ? "Your current rental stays unchanged until Total Tools accepts the extension request." : "We only show a confirmation after the rental request is accepted."}</p></header>
          <div className="rental-detail-next__reservation-grid">
            <label>Branch<select required value={reservation.branch} onChange={(event) => setReservation((prev) => ({ ...prev, branch: event.target.value }))}><option value="">Select branch</option>{company.branches.map((branch) => <option key={branch.name} value={branch.name}>{branch.name}</option>)}</select></label>
            <label>{extensionOf ? "Extension starts" : "Start date"}<input type="date" required value={reservation.startDate} onChange={(event) => setReservation((prev) => ({ ...prev, startDate: event.target.value }))} /></label>
            <label>{extensionOf ? "New return date" : "End date"}<input type="date" required value={reservation.endDate} onChange={(event) => setReservation((prev) => ({ ...prev, endDate: event.target.value }))} /></label>
            <label>Pickup or delivery<select required value={reservation.fulfillment} onChange={(event) => setReservation((prev) => ({ ...prev, fulfillment: event.target.value as FulfillmentMode }))}><option value="unspecified">Choose</option><option value="pickup">Pickup</option><option value="delivery">Delivery</option></select></label>
            <label>Full name<input autoComplete="name" required value={reservation.fullName} onChange={(event) => setReservation((prev) => ({ ...prev, fullName: event.target.value }))} /></label>
            <label>Email<input autoComplete="email" type="email" required value={reservation.email} onChange={(event) => setReservation((prev) => ({ ...prev, email: event.target.value }))} /></label>
            <label>Phone<input autoComplete="tel" inputMode="tel" required value={reservation.phone} onChange={(event) => setReservation((prev) => ({ ...prev, phone: event.target.value }))} /></label>
          </div>

          {availableAddOns.length ? <section className="sc-rental-addons" aria-labelledby="sc-rental-addons-title">
            <div className="sc-rental-addons__heading"><span>Make the rental job-ready</span><h3 id="sc-rental-addons-title">Add equipment, attachments or services</h3><p>Choose what you need with the rental. Items marked “Confirm with reservation” are requested now and verified by Total Tools before confirmation.</p></div>
            <div className="sc-rental-addons__grid">{availableAddOns.map((addOn) => {
              const selected = reservation.addOns.find((item) => item.id === addOn.id);
              const priced = typeof addOn.unitPrice === "number" && addOn.unitPrice >= 0;
              return <article key={addOn.id} className={`sc-rental-addon${selected ? " is-selected" : ""}`}>
                <button type="button" className="sc-rental-addon__toggle" aria-pressed={Boolean(selected)} onClick={() => toggleAddOn(addOn)}>
                  <span className="sc-rental-addon__icon">{addOnIcon(addOn)}</span>
                  <span className="sc-rental-addon__copy"><strong>{addOn.name}</strong><small>{addOn.description}</small></span>
                  <span className="sc-rental-addon__price">{priced ? `${money(addOn.unitPrice!)} ${addOn.rateBasis.replace("_", " ")}` : "Confirm with reservation"}</span>
                </button>
                {selected && (addOn.maximumQuantity || 1) > 1 ? <label className="sc-rental-addon__quantity">Quantity<input type="number" min={Math.max(1, addOn.minimumQuantity || 1)} max={addOn.maximumQuantity || 99} value={selected.quantity} onChange={(event) => setAddOnQuantity(addOn, Number(event.target.value))} /></label> : null}
              </article>;
            })}</div>
          </section> : null}

          <div className="rental-detail-next__estimate">
            <div><span>Duration</span><strong>{rentalDays ? `${rentalDays} day${rentalDays === 1 ? "" : "s"}` : "Select dates"}</strong></div>
            <div><span>Equipment estimate</span><strong>{subtotal ? money(subtotal) : "Calculated from dates"}</strong></div>
            <div><span>Add-ons requested</span><strong>{reservation.addOns.length || "None"}</strong></div>
            <div><span>Availability</span><strong>Confirmed on request</strong></div>
          </div>

          {error ? <p className="rental-context-bar__error" role="alert">{error}</p> : null}
          <button type="submit" disabled={submitting}>{submitting ? <><Loader2 size={16} /> Submitting…</> : extensionOf ? "Request extension" : "Request reservation"}</button>
        </form>

        <section className="rental-detail-next__grid rental-detail-next__supporting">
          <article className="rental-detail-next__card"><h2>Before you reserve</h2><p><MapPin size={16} /> Your selected branch handles the request.</p><p><CalendarDays size={16} /> Dates are used to confirm equipment availability.</p><p><Truck size={16} /> Pickup or delivery is included with the request.</p></article>
          <article className="rental-detail-next__card"><h2>Need help choosing?</h2><p>Not sure this machine is right for the site, load, reach, attachment, or operator requirement? Ask SmartCommerce before you reserve.</p><a href={routeHref(`/assistant?prompt=${encodeURIComponent(`Compare ${rental.name} with the best rental alternatives and add-ons for my job`)}`)}><Sparkles size={16} /> Compare with AI</a></article>
        </section>
      </Container>
    </div>
  );
}
