import { CalendarClock, ChevronRight, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { canRequestExtension, extensionHref, listCustomerRentals, type CustomerRental } from "../../services/customerRentalsClient";
import { routeHref } from "../../lib/router";
import "../../styles/rental-lifecycle.css";

function dueLabel(rental: CustomerRental) {
  if (rental.daysRemaining < 0) return `${Math.abs(rental.daysRemaining)} day${Math.abs(rental.daysRemaining) === 1 ? "" : "s"} overdue`;
  if (rental.daysRemaining === 0) return "Due today";
  if (rental.daysRemaining === 1) return "Due tomorrow";
  return `Due in ${rental.daysRemaining} days`;
}

export default function RentalDueAlert() {
  const [rental, setRental] = useState<CustomerRental | null>(null);

  useEffect(() => {
    let active = true;
    listCustomerRentals()
      .then((result) => { if (active) setRental(result.dueSoon[0] || null); })
      .catch(() => { if (active) setRental(null); });
    return () => { active = false; };
  }, []);

  if (!rental) return null;
  const requestable = canRequestExtension(rental);

  return (
    <section className={`sc-rental-due-alert is-${rental.reminderLevel}`} aria-label="Rental return reminder">
      <div className="sc-rental-due-alert__icon"><CalendarClock size={19} aria-hidden="true" /></div>
      <div className="sc-rental-due-alert__copy">
        <strong>{dueLabel(rental)} · {rental.equipment_name}</strong>
        <span>Return by {new Date(rental.end_at).toLocaleDateString("en-JM", { day: "numeric", month: "short", year: "numeric" })}{rental.branch ? ` at ${rental.branch}` : ""}.{requestable ? " Need it longer? Request an extension before the deadline." : " This agreement is not currently eligible for an online extension request."}</span>
      </div>
      <div className="sc-rental-due-alert__actions">
        {requestable ? <a href={extensionHref(rental)}><RotateCcw size={15} /> Extend rental</a> : null}
        <a href={routeHref("/account?section=rentals")}>View rental <ChevronRight size={15} /></a>
      </div>
    </section>
  );
}
