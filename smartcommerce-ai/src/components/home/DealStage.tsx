import { ArrowRight, BadgePercent } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getVerifiedPromotions } from "../../data/merchandising";
import { routeHref } from "../../lib/router";
import Container from "../shared/Container";

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
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % promotions.length), 10000);
    return () => window.clearInterval(timer);
  }, [paused, promotions.length, reducedMotion]);

  if (!promotions.length) return null;

  const promotion = promotions[index];
  const start = formatDate(promotion.startAt);
  const end = formatDate(promotion.endAt);
  const validity = start && end ? `${start} – ${end}` : end ? `Ends ${end}` : start ? `Starts ${start}` : "";

  return (
    <section className="sc-deal-stage sc-deal-stage--campaign v2-deal-stage" aria-label="Current verified promotion" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={(event) => {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
      setPaused(false);
    }}>
      <Container size="wide" className="sc-deal-stage__campaign-inner">
        <div className="sc-deal-stage__campaign-copy" aria-live="off">
          <span><BadgePercent size={16} aria-hidden="true" /> {promotion.eyebrow}</span>
          {promotion.value ? <strong className="sc-deal-stage__value">{promotion.value}</strong> : null}
          <h2>{promotion.headline}</h2>
          {promotion.detail ? <p>{promotion.detail}</p> : null}
          <div className="sc-deal-stage__terms">
            {promotion.eligibility ? <span>{promotion.eligibility}</span> : null}
            {validity ? <span>{validity}</span> : null}
          </div>
          <div className="sc-deal-stage__ctas">
            <a className="is-primary" href={routeHref(promotion.primaryHref)}>{promotion.primaryCta} <ArrowRight size={16} /></a>
            {promotion.secondaryHref && promotion.secondaryCta ? <a href={routeHref(promotion.secondaryHref)}>{promotion.secondaryCta}</a> : null}
          </div>
        </div>
        {promotion.imageUrl ? <div className="sc-deal-stage__campaign-media"><img src={promotion.imageUrl} alt="" /></div> : <div className="sc-deal-stage__campaign-mark" aria-hidden="true"><BadgePercent size={72} /></div>}
        {promotions.length > 1 ? <div className="sc-deal-stage__pager" aria-label="Choose promotion">{promotions.map((item, itemIndex) => <button key={item.id} type="button" className={itemIndex === index ? "is-active" : ""} onClick={() => setIndex(itemIndex)} aria-label={`Show ${item.eyebrow}`} aria-pressed={itemIndex === index} />)}</div> : null}
      </Container>
    </section>
  );
}
