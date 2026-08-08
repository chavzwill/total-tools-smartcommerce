import { Bot, Building2, CalendarClock, Package, Truck } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { getRoute, routeHref } from "../../lib/router";

type CommerceDeal = {
  id: string;
  type: "discount" | "delivery" | "rental" | "commercial" | "ai" | "event";
  eyebrow?: string;
  headline: string;
  detail?: string;
  value?: string;
  callToAction?: string;
  href?: string;
  icon?: ReactNode;
  startAt?: string;
  endAt?: string;
  priority?: number;
};

const ROTATION_MS = 7000;

const configuredDeals: CommerceDeal[] = [
  {
    id: "first-order",
    type: "discount",
    eyebrow: "Deal",
    value: "5% OFF",
    headline: "5% off your first online order",
    callToAction: "Activate offer",
    href: "/products",
    icon: <Package size={16} aria-hidden="true" />,
    priority: 90,
  },
  {
    id: "delivery",
    type: "delivery",
    eyebrow: "Delivery",
    value: "J$50,000+",
    headline: "Free islandwide delivery over J$50,000",
    callToAction: "Shop eligible items",
    href: "/products",
    icon: <Truck size={16} aria-hidden="true" />,
    priority: 80,
  },
  {
    id: "rental-special",
    type: "rental",
    eyebrow: "Rental Special",
    headline: "Weekend rental specials available",
    detail: "Reserve maintained fleet equipment with flexible terms.",
    callToAction: "View rentals",
    href: "/rentals",
    icon: <CalendarClock size={16} aria-hidden="true" />,
    priority: 78,
  },
  {
    id: "commercial-pricing",
    type: "commercial",
    eyebrow: "Commercial",
    headline: "Commercial account pricing available",
    detail: "Qualified business customers can access volume-focused pricing.",
    callToAction: "Apply or sign in",
    href: "/commercial",
    icon: <Building2 size={16} aria-hidden="true" />,
    priority: 82,
  },
  {
    id: "ai-assist",
    type: "ai",
    eyebrow: "AI Assist",
    headline: "Not sure what tool you need?",
    detail: "Ask SmartCommerce for guided recommendations.",
    callToAction: "Ask SmartCommerce",
    href: "/assistant",
    icon: <Bot size={16} aria-hidden="true" />,
    priority: 72,
  },
];

const isDealScheduled = (deal: CommerceDeal, now: number) => {
  if (deal.startAt && Number.isFinite(Date.parse(deal.startAt)) && now < Date.parse(deal.startAt)) return false;
  if (deal.endAt && Number.isFinite(Date.parse(deal.endAt)) && now > Date.parse(deal.endAt)) return false;
  return true;
};

const getRelevanceBonus = (deal: CommerceDeal, path: string) => {
  if (path.startsWith("/rentals") && deal.type === "rental") return 22;
  if (path.startsWith("/commercial") && deal.type === "commercial") return 22;
  if ((path.startsWith("/assistant") || path.startsWith("/product-match")) && deal.type === "ai") return 22;
  if (deal.type === "delivery") return 8;
  return 0;
};

export default function PromoTicker() {
  const [path, setPath] = useState(() => getRoute().path);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const pauseRef = useRef(0);

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

  const deals = useMemo(() => {
    const now = Date.now();
    return configuredDeals
      .filter((deal) => isDealScheduled(deal, now))
      .map((deal, index) => ({
        deal,
        score: (deal.priority || 0) + getRelevanceBonus(deal, path),
        fallback: index,
      }))
      .sort((a, b) => (b.score - a.score) || (a.fallback - b.fallback))
      .map((item) => item.deal);
  }, [path]);

  useEffect(() => {
    if (!deals.length) {
      setActiveIndex(0);
      return;
    }
    setActiveIndex((previous) => (previous >= deals.length ? 0 : previous));
  }, [deals]);

  useEffect(() => {
    if (reducedMotion || paused || deals.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % deals.length);
    }, ROTATION_MS);
    return () => window.clearInterval(timer);
  }, [deals.length, paused, reducedMotion]);

  const activeDeal = deals[activeIndex];
  if (!activeDeal) return null;

  const nextDeal = deals[(activeIndex + 1) % deals.length];
  const canRotate = deals.length > 1;
  const ctaLabel = activeDeal.callToAction || "Learn more";

  const setPauseState = (nextPaused: boolean) => {
    if (!canRotate) return;
    if (nextPaused) {
      pauseRef.current += 1;
      setPaused(true);
      return;
    }
    pauseRef.current = Math.max(0, pauseRef.current - 1);
    if (!pauseRef.current) setPaused(false);
  };

  const jump = (direction: 1 | -1) => {
    if (!canRotate) return;
    setActiveIndex((current) => {
      const lastIndex = deals.length - 1;
      if (direction === 1) return current >= lastIndex ? 0 : current + 1;
      return current === 0 ? lastIndex : current - 1;
    });
  };

  return (
    <aside
      className="sc-deal-rail"
      aria-label="Current offers"
      onMouseEnter={() => setPauseState(true)}
      onMouseLeave={() => setPauseState(false)}
      onFocusCapture={() => setPauseState(true)}
      onBlurCapture={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setPauseState(false);
      }}
    >
      <div className="sc-deal-rail__inner">
        <div className="sc-deal-rail__active" aria-live="off">
          <span className="sc-deal-rail__eyebrow">{activeDeal.eyebrow || activeDeal.type}</span>
          <div className="sc-deal-rail__headline">
            {activeDeal.icon}
            <strong>{activeDeal.headline}</strong>
          </div>
          {activeDeal.detail && <p>{activeDeal.detail}</p>}
          <div className="sc-deal-rail__meta">
            {activeDeal.value ? <b>{activeDeal.value}</b> : <span />}
            {activeDeal.href ? <a href={routeHref(activeDeal.href)}>{ctaLabel}</a> : <span className="sc-deal-rail__cta">{ctaLabel}</span>}
          </div>
        </div>

        <div className="sc-deal-rail__controls">
          {canRotate && nextDeal && (
            <div className="sc-deal-rail__preview" aria-hidden="true">
              <span>Up next</span>
              <strong>{nextDeal.headline}</strong>
            </div>
          )}
          <div className="sc-deal-rail__buttons">
            <button type="button" onClick={() => jump(-1)} disabled={!canRotate} aria-label="Show previous deal">Prev</button>
            <button type="button" onClick={() => jump(1)} disabled={!canRotate} aria-label="Show next deal">Next</button>
          </div>
        </div>
      </div>

      {canRotate && !reducedMotion && (
        <div className="sc-deal-rail__progress" aria-hidden="true">
          <span
            key={`${activeDeal.id}-${paused ? "paused" : "running"}`}
            className={paused ? "is-paused" : ""}
            style={{ animationDuration: `${ROTATION_MS}ms` }}
          />
        </div>
      )}
    </aside>
  );
}
