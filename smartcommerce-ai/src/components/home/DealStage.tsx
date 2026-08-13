import { ArrowRight, BadgePercent, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getVerifiedPromotions } from "../../data/merchandising";
import { routeHref } from "../../lib/router";
import Container from "../shared/Container";

const ROTATION_MS = 10000;

const formatDate = (value?: string) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return "";
  return new Intl.DateTimeFormat("en-JM", { dateStyle: "medium" }).format(parsed);
};

export default function DealStage() {
  const promotions = useMemo(() => getVerifiedPromotions(), []);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (paused || reducedMotion || promotions.length <= 1) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % promotions.length), ROTATION_MS);
    return () => window.clearInterval(timer);
  }, [paused, promotions.length, reducedMotion]);

  if (!promotions.length) return null;

  const promotion = promotions[index];
  const start = formatDate(promotion.startAt);
  const end = formatDate(promotion.endAt);
  const validity = start && end ? `${start} – ${end}` : end ? `Ends ${end}` : start ? `Starts ${start}` : "";

  const move = (direction: 1 | -1) => {
    setIndex((current) => {
      const next = current + direction;
      if (next < 0) return promotions.length - 1;
      if (next >= promotions.length) return 0;
      return next;
    });
  };

  return (
    <section
      className={`v3-campaign-stage v3-campaign-stage--${promotion.type}`}
      aria-label="Current verified promotion"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setPaused(false);
      }}
    >
      {promotion.imageUrl ? (
        <div className="v3-campaign-stage__backdrop" aria-hidden="true">
          <img src={promotion.imageUrl} alt="" decoding="async" />
        </div>
      ) : null}
      <div className="v3-campaign-stage__wash" aria-hidden="true" />

      <Container size="wide" className="v3-campaign-stage__inner">
        <div className="v3-campaign-stage__copy" aria-live="off">
          <div className="v3-campaign-stage__eyebrow"><BadgePercent size={17} aria-hidden="true" /><span>{promotion.eyebrow}</span><b>VERIFIED OFFER</b></div>
          <div className="v3-campaign-stage__headline-row">
            {promotion.value ? <strong className="v3-campaign-stage__value">{promotion.value}</strong> : null}
            <h2>{promotion.headline}</h2>
          </div>
          {promotion.detail ? <p className="v3-campaign-stage__detail">{promotion.detail}</p> : null}
          <div className="v3-campaign-stage__meta">
            {promotion.eligibility ? <span>{promotion.eligibility}</span> : null}
            {validity ? <span>{validity}</span> : null}
          </div>
          <div className="v3-campaign-stage__ctas">
            <a className="is-primary" href={routeHref(promotion.primaryHref)}>{promotion.primaryCta}<ArrowRight size={18} /></a>
            {promotion.secondaryHref && promotion.secondaryCta ? <a href={routeHref(promotion.secondaryHref)}>{promotion.secondaryCta}</a> : null}
          </div>
        </div>

        <div className="v3-campaign-stage__signature" aria-hidden="true">
          <span>SMARTCOMMERCE</span>
          <strong>DEALS</strong>
        </div>

        {promotions.length > 1 ? (
          <div className="v3-campaign-stage__controls" aria-label="Promotion controls">
            <button type="button" onClick={() => move(-1)} aria-label="Previous promotion"><ChevronLeft size={18} /></button>
            <span>{String(index + 1).padStart(2, "0")} / {String(promotions.length).padStart(2, "0")}</span>
            <button type="button" onClick={() => move(1)} aria-label="Next promotion"><ChevronRight size={18} /></button>
          </div>
        ) : null}
      </Container>

      {!reducedMotion && promotions.length > 1 ? <div className={`v3-campaign-stage__progress ${paused ? "is-paused" : ""}`}><span key={`${promotion.id}-${paused ? "paused" : "running"}`} style={{ animationDuration: `${ROTATION_MS}ms` }} /></div> : null}
    </section>
  );
}
