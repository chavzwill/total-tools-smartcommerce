import { CalendarCheck, CheckCircle2, Scale, Truck } from "lucide-react";
import { money } from "../../lib/format";
import { routeHref } from "../../lib/router";
import type { RentalItem } from "../../types";

type RentalTileProps = {
  rental: RentalItem;
  href?: string;
  compared?: boolean;
  onToggleCompare?: (id: string) => void;
  primaryActionLabel?: string;
};

export default function RentalTile({
  rental,
  href,
  compared = false,
  onToggleCompare,
  primaryActionLabel,
}: RentalTileProps) {
  const keyCapability =
    Object.entries(rental.specs || {}).find(([, value]) => value?.trim()) ||
    ["Capability", rental.description];
  const itemHref = href || routeHref(`/rental/${rental.id}`);
  const hasPricing = rental.dailyRate > 0 || rental.weeklyRate > 0 || rental.monthlyRate > 0;
  const action = primaryActionLabel || (hasPricing ? "Select dates" : "Check availability");
  const delivery = String(rental.specs?.Delivery || "").trim();

  return (
    <article className="demo-rental-card rental-card-next">
      <a className="demo-rental-card__image" href={itemHref} aria-label={`View ${rental.name}`}>
        <img src={rental.image} alt={rental.name} loading="lazy" decoding="async" />
      </a>

      <div className="demo-rental-card__body">
        <small>{rental.category}</small>
        <a className="rental-card-next__title" href={itemHref}>
          <h3>{rental.name}</h3>
        </a>

        <p className="demo-rental-capability">
          <strong>{keyCapability[0]}:</strong> {keyCapability[1]}
        </p>

        <div className="rental-card-next__availability">
          <span><CheckCircle2 size={15} /> {rental.availability}</span>
          {delivery ? <span><Truck size={14} /> {delivery}</span> : null}
        </div>

        {hasPricing ? (
          <div className="demo-rates rental-card-next__rates" aria-label={`Rental rates for ${rental.name}`}>
            <span>
              <em>Daily</em>
              <b>{rental.dailyRate > 0 ? money(rental.dailyRate) : "—"}</b>
            </span>
            <span>
              <em>Weekly</em>
              <b>{rental.weeklyRate > 0 ? money(rental.weeklyRate) : "—"}</b>
            </span>
            <span>
              <em>Monthly</em>
              <b>{rental.monthlyRate > 0 ? money(rental.monthlyRate) : "—"}</b>
            </span>
          </div>
        ) : (
          <p className="rental-card-next__missing-rate">Set your branch and dates to verify the rate.</p>
        )}

        <div className="demo-rental-actions rental-card-next__actions">
          <a className="rental-card-next__primary" href={itemHref}>
            <CalendarCheck size={17} /> {action}
          </a>
          {onToggleCompare ? (
            <button
              className={compared ? "active rental-card-next__compare" : "rental-card-next__compare"}
              onClick={() => onToggleCompare(rental.id)}
              type="button"
              aria-pressed={compared}
            >
              <Scale size={17} /> {compared ? "Compared" : "Compare"}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
