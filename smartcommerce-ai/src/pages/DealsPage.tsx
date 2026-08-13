import { ArrowRight, BadgePercent, BriefcaseBusiness, HardHat, ShoppingBag, Wrench } from "lucide-react";
import Container from "../components/shared/Container";
import { getVerifiedPromotions } from "../data/merchandising";
import { routeHref } from "../lib/router";

const alternatives = [
  ["Products", "Browse the connected product experience", "/products", ShoppingBag],
  ["Rentals", "Plan equipment by branch, dates, and job", "/rentals", HardHat],
  ["Repairs", "Start a service request", "/repairs", Wrench],
  ["Commercial", "Get business and contractor support", "/commercial", BriefcaseBusiness],
] as const;

const formatValidity = (startAt?: string, endAt?: string) => {
  const formatter = new Intl.DateTimeFormat("en-JM", { dateStyle: "medium" });
  const start = startAt ? new Date(startAt) : undefined;
  const end = endAt ? new Date(endAt) : undefined;
  const startText = start && !Number.isNaN(start.valueOf()) ? formatter.format(start) : "";
  const endText = end && !Number.isNaN(end.valueOf()) ? formatter.format(end) : "";
  if (startText && endText) return `${startText} – ${endText}`;
  if (endText) return `Ends ${endText}`;
  if (startText) return `Starts ${startText}`;
  return "";
};

export default function DealsPage() {
  const promotions = getVerifiedPromotions();

  return (
    <div className="demo-page sc-deals-page">
      <section className="demo-page-hero sc-deals-page__hero">
        <Container>
          <span>Deals and offers</span>
          <h1>See what Total Tools has actually published.</h1>
          <p>Only verified configured campaigns are shown here. Expired, future, or unverified offers stay hidden.</p>
        </Container>
      </section>
      <Container className="sc-deals-page__content">
        {promotions.length ? (
          <div className="sc-deals-grid">
            {promotions.map((promotion) => {
              const validity = formatValidity(promotion.startAt, promotion.endAt);
              return (
                <article key={promotion.id} className="sc-deal-card">
                  <span><BadgePercent size={17} /> {promotion.eyebrow}</span>
                  {promotion.value ? <strong className="sc-deal-card__value">{promotion.value}</strong> : null}
                  <h2>{promotion.headline}</h2>
                  {promotion.detail ? <p>{promotion.detail}</p> : null}
                  <dl>
                    {promotion.eligibility ? <div><dt>Qualification</dt><dd>{promotion.eligibility}</dd></div> : null}
                    {validity ? <div><dt>Valid</dt><dd>{validity}</dd></div> : null}
                    <div><dt>Offer type</dt><dd>{promotion.type}</dd></div>
                  </dl>
                  <div>
                    <a className="is-primary" href={routeHref(promotion.primaryHref)}>{promotion.primaryCta} <ArrowRight size={15} /></a>
                    {promotion.secondaryHref && promotion.secondaryCta ? <a href={routeHref(promotion.secondaryHref)}>{promotion.secondaryCta}</a> : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <section className="sc-deals-empty" aria-labelledby="sc-deals-empty-title">
            <BadgePercent size={30} aria-hidden="true" />
            <span>No verified campaign is published right now</span>
            <h2 id="sc-deals-empty-title">The deals page will not invent an offer just to fill the space.</h2>
            <p>Use the live commerce paths below while the business publishes its next verified promotion.</p>
            <div>
              {alternatives.map(([title, description, href, Icon]) => (
                <a href={routeHref(href)} key={title}>
                  <Icon size={20} />
                  <span><strong>{title}</strong><small>{description}</small></span>
                  <ArrowRight size={15} />
                </a>
              ))}
            </div>
          </section>
        )}
      </Container>
    </div>
  );
}
