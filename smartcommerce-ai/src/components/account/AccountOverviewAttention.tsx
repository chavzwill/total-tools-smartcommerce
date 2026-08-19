import { CalendarClock, ChevronRight, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { canRequestExtension, extensionHref, listCustomerRentals, type CustomerRental } from "../../services/customerRentalsClient";

function priority(rental: CustomerRental) {
  if (rental.reminderLevel === "overdue") return 0;
  if (rental.reminderLevel === "urgent") return 1;
  if (rental.reminderLevel === "due_soon") return 2;
  if (rental.reminderLevel === "upcoming") return 3;
  return 4;
}

function attentionTitle(rental: CustomerRental) {
  if (rental.daysRemaining < 0) return `${rental.equipment_name} is overdue`;
  if (rental.daysRemaining === 0) return `${rental.equipment_name} is due today`;
  if (rental.daysRemaining === 1) return `${rental.equipment_name} is due tomorrow`;
  return `${rental.equipment_name} is due in ${rental.daysRemaining} days`;
}

function attentionCopy(rental: CustomerRental) {
  const date = new Date(rental.end_at).toLocaleDateString("en-JM", { day: "numeric", month: "short", year: "numeric" });
  const returnCopy = `Return by ${date}${rental.branch ? ` at ${rental.branch}` : ""}.`;
  return canRequestExtension(rental)
    ? `${returnCopy} If you need more time, request an extension before the deadline.`
    : `${returnCopy} This agreement is not currently eligible for an online extension request.`;
}

export default function AccountOverviewAttention({ onViewRentals }: { onViewRentals: () => void }) {
  const [rentals, setRentals] = useState<CustomerRental[]>([]);

  useEffect(() => {
    let active = true;
    listCustomerRentals()
      .then((result) => { if (active) setRentals(result.dueSoon); })
      .catch(() => { if (active) setRentals([]); });
    return () => { active = false; };
  }, []);

  const rental = useMemo(() => [...rentals].sort((a, b) => priority(a) - priority(b) || a.daysRemaining - b.daysRemaining)[0] || null, [rentals]);

  if (!rental) {
    return (
      <div className="sc-account-recent">
        <div><span className="sc-eyebrow">Attention</span><h3>No deadlines need your attention</h3><p>Rental return reminders and other time-sensitive account activity will appear here automatically.</p></div>
        <button type="button" onClick={onViewRentals}>View rentals <ChevronRight size={16} /></button>
      </div>
    );
  }

  return (
    <div className={`sc-account-recent is-${rental.reminderLevel}`} role={rental.reminderLevel === "overdue" || rental.reminderLevel === "urgent" ? "alert" : "status"}>
      <div>
        <span className="sc-eyebrow"><CalendarClock size={15} /> Rental deadline</span>
        <h3>{attentionTitle(rental)}</h3>
        <p>{attentionCopy(rental)}</p>
      </div>
      <div className="sc-account-recent__actions">
        {canRequestExtension(rental) ? <a href={extensionHref(rental)}><RotateCcw size={15} /> Extend rental</a> : null}
        <button type="button" onClick={onViewRentals}>Manage rental <ChevronRight size={16} /></button>
      </div>
    </div>
  );
}
