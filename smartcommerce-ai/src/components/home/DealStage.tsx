import { ArrowRight, BadgePercent, BriefcaseBusiness, ShoppingBag, Wrench, HardHat } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getVerifiedPromotions } from "../../data/merchandising";
import { routeHref } from "../../lib/router";
import Container from "../shared/Container";

const FALLBACK_ACTIONS = [
  { label: "Buy", description: "Browse products and categories", href: "/products", icon: ShoppingBag },
  { label: "Rent", description: "Plan equipment by job and dates", href: "/rentals", icon: HardHat },
  { label: "Repair", description: "Start a service request", href: "/repairs", icon: Wrench },
  { label: "Commercial", description: "Request business support", href: "/commercial", icon: BriefcaseBusiness },
] as const;

const formatDate = (value?: string) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return "";
  return new Intl.DateTimeFormat("en-JM", { dateStyle: "medium" }).format(parsed);
};

export default function DealStage() {
  const promotions = useMemo(() => getVerifiedPromotions(), []);
  const [index, setIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reducedMotion || promotions.length <= 1) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % promotions.length);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [promotions.length, reducedMotion]);

  if (!promotions.length) {
    return (
      <section className="sc-deal-stage sc-deal-stage--services" aria-labelledby="sc-service-stage-title">
        <Container size="wide" className="sc-deal-stage__services-inner">
          <div className="sc-deal-stage__services-copy">
            <span>One Total Tools experience</span>
            <h2 id="sc-service-stage-title">Choose the fastest way to move the job forward.</h2>
            <p>Buy, rent, repair, or get commercial help without searching through disconnected systems.</p>
          </div>
          <div className="sc-deal-stage__service-actions">
            {FALLBACK_ACTIONS.map(({ label, description, href, icon: Icon }) => (
              <a href={routeHref(href)} key={label}>
                <Icon size={21} aria-hidden="true" />
                <span><strong>{label}</strong><small>{description}</small></span>
                <ArrowRight size={16} aria-hidden="true" />
              </a>
            ))}
          </div>
        </Container>
      </section>
    );
  }

  const promotion = promotions[index];
  const start = formatDate(promotion.startAt);
  const end = formatDate(promotion.endAt);
  const validity = start && end ? `${start} – ${end}` : end ? `Ends ${end}` : start ? `Starts ${start}` : "";

  return (
    <section className="sc-deal-stage sc-deal-stage--campaign" aria-label="Current verified promotion">
      <Container size="wide" className="sc-deal-stage__campaign-inner">
        <div className="sc-deal-stage__campaign-copy">
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
            {promotion.secondaryHref && promotion.secondaryCta ? (
              <a href={routeHref(promotion.secondaryHref)}>{promotion.secondaryCta}</a>
            ) : null}
          </div>
        </div>
        {promotion.imageUrl ? (
          <div className="sc-deal-stage__campaign-media"><img src={promotion.imageUrl} alt="" /></div>
        ) : (
          <div className="sc-deal-stage__campaign-mark" aria-hidden="true"><BadgePercent size={72} /></div>
        )}
        {promotions.length > 1 ? (
          <div className="sc-deal-stage__pager" aria-label="Choose promotion">
            {promotions.map((item, itemIndex) => (
              <button
                key={item.id}
                type="button"
                className={itemIndex === index ? "is-active" : ""}
                onClick={() => setIndex(itemIndex)}
                aria-label={`Show ${item.eyebrow}`}
                aria-pressed={itemIndex === index}
              />
            ))}
          </div>
        ) : null}
      </Container>
    </section>
  );
}
