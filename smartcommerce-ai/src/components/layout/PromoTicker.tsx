import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { commerceSignals } from "../../data/merchandising";
import { getRoute, routeHref } from "../../lib/router";

const ROTATION_MS = 8500;

export default function PromoTicker() {
  const [path, setPath] = useState(() => getRoute().path);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const onHashChange = () => setPath(getRoute().path);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const signals = useMemo(() => {
    return [...commerceSignals].sort((a, b) => {
      const aRelevant = a.routePrefix && path.startsWith(a.routePrefix) ? 1 : 0;
      const bRelevant = b.routePrefix && path.startsWith(b.routePrefix) ? 1 : 0;
      return bRelevant - aRelevant;
    });
  }, [path]);

  useEffect(() => {
    setActiveIndex((current) => (current >= signals.length ? 0 : current));
  }, [signals.length]);

  useEffect(() => {
    if (paused || reducedMotion || signals.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % signals.length);
    }, ROTATION_MS);
    return () => window.clearInterval(timer);
  }, [paused, reducedMotion, signals.length]);

  const active = signals[activeIndex];
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
    <aside
      className="sc-signal-rail"
      aria-label="Total Tools shopping updates"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setPaused(false);
      }}
    >
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
      {!reducedMotion && signals.length > 1 ? (
        <div className="sc-signal-rail__progress" aria-hidden="true"><span key={`${active.id}-${paused ? "paused" : "running"}`} className={paused ? "is-paused" : ""} style={{ animationDuration: `${ROTATION_MS}ms` }} /></div>
      ) : null}
    </aside>
  );
}
