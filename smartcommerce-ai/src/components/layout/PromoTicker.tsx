import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { commerceSignals } from "../../data/merchandising";
import { getRoute, routeHref } from "../../lib/router";

export default function PromoTicker() {
  const [activeIndex, setActiveIndex] = useState(0);
  const path = getRoute().path;

  const signals = useMemo(() => {
    return [...commerceSignals].sort((a, b) => {
      const aRelevant = a.routePrefix && path.startsWith(a.routePrefix) ? 1 : 0;
      const bRelevant = b.routePrefix && path.startsWith(b.routePrefix) ? 1 : 0;
      return bRelevant - aRelevant;
    });
  }, [path]);

  const active = signals[activeIndex] || signals[0];
  if (!active) return null;

  const move = (direction: 1 | -1) => {
    setActiveIndex((current) => {
      const next = current + direction;
      if (next < 0) return signals.length - 1;
      if (next >= signals.length) return 0;
      return next;
    });
  };

  return (
    <aside className="sc-signal-rail sc-signal-rail--static" aria-label="Total Tools shopping updates">
      <div className="sc-signal-rail__identity">
        <span className="sc-signal-rail__pulse" aria-hidden="true" />
        <strong>SmartCommerce</strong>
        <span>Today</span>
      </div>
      <div className="sc-signal-rail__message" aria-live="off">

        <span>{active.eyebrow}</span>
        <strong>{active.headline}</strong>
        {active.detail ? <small>{active.detail}</small> : null}
      </div>
      <div className="sc-signal-rail__actions">
        {active.href && active.cta ? <a href={routeHref(active.href)}>{active.cta}</a> : null}
        {signals.length > 1 ? (
          <div className="sc-signal-rail__pager">
            <button type="button" onClick={() => move(-1)} aria-label="Previous update"><ChevronLeft size={16} /></button>
            <span>{activeIndex + 1}/{signals.length}</span>
            <button type="button" onClick={() => move(1)} aria-label="Next update"><ChevronRight size={16} /></button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
