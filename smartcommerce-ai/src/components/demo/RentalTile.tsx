import { Bot, CalendarCheck, CheckCircle2, Scale, Truck } from "lucide-react";
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
  const keyCapability = Object.entries(rental.specs || {}).find(([, value]) => value?.trim()) || ["Capability", rental.description];
  const showMonthlyRate = rental.monthlyRate > 0;
  const itemHref = href || routeHref(`/rental/${rental.id}`);
  const hasPricing = rental.dailyRate > 0 || rental.weeklyRate > 0 || rental.monthlyRate > 0;
  const action = primaryActionLabel || (hasPricing ? "Check availability" : "Set location and dates");

  return (
    <article className="demo-rental-card rental-card-next">
      <a className="demo-rental-card__image" href={itemHref}><img src={rental.image} alt={rental.name} loading="lazy" decoding="async" /></a>
      <div className="demo-rental-card__body">
        <small>{rental.category}</small>
        <a href={itemHref}><h3>{rental.name}</h3></a>
        <p className="demo-rental-capability"><strong>{keyCapability[0]}:</strong> {keyCapability[1]}</p>
        <p className="demo-available"><CheckCircle2 size={15} /> {rental.availability}</p>
        <p className="demo-branch-stock">{rental.branchAvailability}</p>
        {hasPricing ? (
          <div className={`demo-rates ${showMonthlyRate ? "" : "demo-rates--compact"}`}>
            {rental.dailyRate > 0 && <span><b>{money(rental.dailyRate)}</b><em>Daily rate</em></span>}
            {rental.weeklyRate > 0 && <span><b>{money(rental.weeklyRate)}</b><em>Weekly rate</em></span>}
            {showMonthlyRate && <span><b>{money(rental.monthlyRate)}</b><em>Monthly rate</em></span>}
          </div>
        ) : (
          <p className="rental-card-next__missing-rate">Set branch and rental dates to verify rates.</p>
        )}
        {String(rental.specs?.Delivery || "").trim() && (
          <p className="rental-card-next__delivery">
            <Truck size={14} />
            {rental.specs.Delivery}
          </p>
        )}
        <div className="demo-rental-actions">
          <a href={itemHref}><CalendarCheck size={17} /> {action}</a>
          {onToggleCompare ? <button className={compared ? "active" : ""} onClick={() => onToggleCompare(rental.id)} type="button"><Scale size={17} /> {compared ? "Compared" : "Compare"}</button> : null}
          <a href={itemHref}><Bot size={17} /> View details</a>
        </div>
      </div>
    </article>
  );
}
