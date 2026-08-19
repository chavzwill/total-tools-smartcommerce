import { BriefcaseBusiness, CalendarClock, ChevronRight, MapPin, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { extensionHref, listCustomerRentals, type CustomerRental } from "../../services/customerRentalsClient";
import { routeHref } from "../../lib/router";
import "../../styles/account-rentals.css";

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString("en-JM", { day: "numeric", month: "short", year: "numeric" });
}

function dueLabel(rental: CustomerRental) {
  if (rental.daysRemaining < 0) return `${Math.abs(rental.daysRemaining)} day${Math.abs(rental.daysRemaining) === 1 ? "" : "s"} overdue`;
  if (rental.daysRemaining === 0) return "Due today";
  if (rental.daysRemaining === 1) return "Due tomorrow";
  if (rental.daysRemaining <= 7) return `Due in ${rental.daysRemaining} days`;
  return `Returns ${dateLabel(rental.end_at)}`;
}

function activeStatus(status: string) {
  return !["completed", "cancelled", "declined", "returned"].includes(status.toLowerCase());
}

export default function AccountRentalsPanel() {
  const [rentals, setRentals] = useState<CustomerRental[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    listCustomerRentals()
      .then((result) => { if (active) setRentals(result.rentals); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Rental activity is temporarily unavailable."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const activeRentals = useMemo(() => rentals.filter((rental) => activeStatus(rental.status)), [rentals]);
  const pastRentals = useMemo(() => rentals.filter((rental) => !activeStatus(rental.status)), [rentals]);

  if (loading) {
    return <div className="sc-account-rentals__state" role="status"><CalendarClock size={24} /><div><strong>Loading your rentals…</strong><span>Checking active equipment and return dates.</span></div></div>;
  }

  if (error) {
    return <div className="sc-account-rentals__state"><BriefcaseBusiness size={24} /><div><strong>Rental activity is temporarily unavailable</strong><span>{error}</span></div><a href={routeHref("/rentals")}>Browse rentals</a></div>;
  }

  if (!rentals.length) {
    return <div className="sc-account-rentals__state"><BriefcaseBusiness size={24} /><div><strong>No rental activity yet</strong><span>Accepted SmartCommerce rentals will appear here with return reminders and extension options.</span></div><a href={routeHref("/rentals")}>Browse rental fleet</a></div>;
  }

  return (
    <div className="sc-account-rentals">
      <div className="sc-account-rentals__summary">
        <div><span>Active rentals</span><strong>{activeRentals.length}</strong></div>
        <div><span>Due within 7 days</span><strong>{activeRentals.filter((rental) => rental.daysRemaining <= 7).length}</strong></div>
        <div><span>Past rentals</span><strong>{pastRentals.length}</strong></div>
      </div>

      {activeRentals.length ? <section className="sc-account-rentals__section" aria-labelledby="active-rentals-title">
        <div className="sc-account-rentals__section-heading"><div><span className="sc-eyebrow">Active</span><h3 id="active-rentals-title">Equipment currently on your account</h3></div><a href={routeHref("/rentals")}>Rent more equipment <ChevronRight size={15} /></a></div>
        <div className="sc-account-rentals__list">
          {activeRentals.map((rental) => (
            <article key={rental.id} className={`sc-account-rental is-${rental.reminderLevel}`}>
              <div className="sc-account-rental__top">
                <div><span>{rental.status.replaceAll("_", " ")}</span><h4>{rental.equipment_name}</h4></div>
                <strong>{dueLabel(rental)}</strong>
              </div>
              <div className="sc-account-rental__meta">
                <span><CalendarClock size={15} /> {dateLabel(rental.start_at)} – {dateLabel(rental.end_at)}</span>
                {rental.branch ? <span><MapPin size={15} /> {rental.branch}</span> : null}
                {rental.fulfillment ? <span>{rental.fulfillment === "delivery" ? "Delivery" : "Pickup"}</span> : null}
                {Array.isArray(rental.add_ons) && rental.add_ons.length ? <span>{rental.add_ons.length} add-on{rental.add_ons.length === 1 ? "" : "s"}</span> : null}
              </div>
              <div className="sc-account-rental__actions">
                <a className="is-primary" href={extensionHref(rental)}><RotateCcw size={15} /> Request extension</a>
                <a href={routeHref(`/rental/${encodeURIComponent(rental.rental_asset_id)}`)}>View equipment <ChevronRight size={15} /></a>
              </div>
            </article>
          ))}
        </div>
      </section> : null}

      {pastRentals.length ? <section className="sc-account-rentals__section sc-account-rentals__section--past" aria-labelledby="past-rentals-title">
        <div className="sc-account-rentals__section-heading"><div><span className="sc-eyebrow">History</span><h3 id="past-rentals-title">Previous rentals</h3></div></div>
        <div className="sc-account-rentals__history">
          {pastRentals.slice(0, 12).map((rental) => <div key={rental.id}><span>{rental.equipment_name}</span><span>{dateLabel(rental.start_at)} – {dateLabel(rental.end_at)}</span><strong>{rental.status.replaceAll("_", " ")}</strong></div>)}
        </div>
      </section> : null}
    </div>
  );
}
