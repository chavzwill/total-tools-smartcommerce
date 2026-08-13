import { BriefcaseBusiness, HardHat, ShoppingBag, Wrench } from "lucide-react";
import Container from "../shared/Container";
import { routeHref } from "../../lib/router";
import shopImage from "../../assets/services/shop-products.jpg";
import rentalImage from "../../assets/services/equipment-rentals.jpg";
import repairImage from "../../assets/services/repairs-service.jpg";

const actions = [
  {
    label: "Buy",
    title: "Shop Products",
    description: "Search the catalogue by product, category, model, specification, or job need.",
    button: "Shop products",
    route: "/products",
    icon: ShoppingBag,
    image: shopImage,
  },
  {
    label: "Rent",
    title: "Rent Equipment",
    description: "Set branch and dates, compare equipment, and check provider-backed availability where connected.",
    button: "Plan a rental",
    route: "/rentals",
    icon: HardHat,
    image: rentalImage,
  },
  {
    label: "Repair",
    title: "Repair & Service",
    description: "Identify the equipment, describe the problem, and start a service request.",
    button: "Start repair",
    route: "/repairs",
    icon: Wrench,
    image: repairImage,
  },
  {
    label: "Commercial",
    title: "Business Support",
    description: "Give contractors and organisations a direct route to quote and project support.",
    button: "Commercial support",
    route: "/commercial",
    icon: BriefcaseBusiness,
    image: rentalImage,
  },
] as const;

export default function PrimaryActions() {
  return (
    <section className="primary-actions sc-commerce-modes" aria-labelledby="sc-commerce-modes-title">
      <Container size="wide">
        <div className="sc-commerce-modes__heading">
          <span>Choose how you need Total Tools</span>
          <h2 id="sc-commerce-modes-title">Buy it. Rent it. Repair it. Get commercial help.</h2>
        </div>
        <div className="primary-actions__grid">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <article className={`primary-action primary-action--${action.label.toLowerCase()}`} key={action.label}>
                <div className="primary-action__copy">
                  <div className="primary-action__icon"><Icon size={24} /></div>
                  <span>{action.label}</span>
                  <h3>{action.title}</h3>
                  <p>{action.description}</p>
                  <a href={routeHref(action.route)}>{action.button}</a>
                </div>
                <a className="primary-action__image" href={routeHref(action.route)} aria-label={action.button}>
                  <img src={action.image} alt="" loading="lazy" decoding="async" />
                </a>
              </article>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
