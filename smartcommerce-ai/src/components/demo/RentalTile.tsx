import { Bot, CalendarCheck, CheckCircle2, Scale } from "lucide-react";
import { useState } from "react";
import { money } from "../../lib/format";
import { routeHref } from "../../lib/router";
import type { RentalItem } from "../../types";

export default function RentalTile({ rental }: { rental: RentalItem }) {
  const [compared, setCompared] = useState(false);
  return (
    <article className="demo-rental-card">
      <a className="demo-rental-card__image" href={routeHref(`/rental/${rental.id}`)}><img src={rental.image} alt={rental.name} /></a>
      <div className="demo-rental-card__body">
        <small>{rental.category}</small>
        <a href={routeHref(`/rental/${rental.id}`)}><h3>{rental.name}</h3></a>
        <p className="demo-available"><CheckCircle2 size={15} /> {rental.availability}</p>
        <p className="demo-branch-stock">{rental.branchAvailability}</p>
        <div className="demo-rates"><span><b>{money(rental.dailyRate)}</b>/day</span><span><b>{money(rental.weeklyRate)}</b>/week</span><span><b>{money(rental.monthlyRate)}</b>/month</span></div>
        <div className="demo-rental-actions">
          <a href={routeHref(`/rental/${rental.id}`)}><CalendarCheck size={17} /> Reserve</a>
          <button className={compared ? "active" : ""} onClick={() => setCompared((value) => !value)}><Scale size={17} /> {compared ? "Compared" : "Compare"}</button>
          <a href={routeHref(`/assistant?prompt=${encodeURIComponent(`I need to rent ${rental.name}`)}`)}><Bot size={17} /> Ask AI</a>
        </div>
      </div>
    </article>
  );
}
