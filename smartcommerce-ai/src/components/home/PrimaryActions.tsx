import { Camera, Drill, HardHat, ShoppingBag } from "lucide-react";
import Container from "../shared/Container";
import { routeHref } from "../../lib/router";
import shopImage from "../../assets/services/shop-products.jpg";
import rentalImage from "../../assets/services/equipment-rentals.jpg";
import repairImage from "../../assets/services/repairs-service.jpg";
import matchImage from "../../assets/generator-recommendation.png";

const actions = [
  { label: "Shop", title: "Shop Products", description: "Browse 100,000+ tools, generators, electrical, safety, cleaning, welding, and construction products.", button: "Start Shopping", route: "/products", icon: ShoppingBag, image: shopImage },
  { label: "Rent", title: "Rent Equipment", description: "Reserve excavators, forklifts, man lifts, generators, concrete mixers, rollers, and more.", button: "Browse Rentals", route: "/rentals", icon: HardHat, image: rentalImage },
  { label: "Repair", title: "Repair Services", description: "Book diagnostics, maintenance, and repairs for tools, equipment, generators, pumps, and more.", button: "Book Repair", route: "/repairs", icon: Drill, image: repairImage },
  { label: "Match", title: "Product Match", description: "Upload a photo and our AI finds the closest match, alternatives, accessories, stock, and pricing.", button: "Match a Product", route: "/product-match", icon: Camera, image: matchImage }
];

export default function PrimaryActions() {
  return (
    <section className="primary-actions" aria-label="Primary Total Tools services">
      <Container size="wide" className="primary-actions__grid">
        {actions.map((action) => {
          const Icon = action.icon;
          return <article className={`primary-action primary-action--${action.label.toLowerCase()}`} key={action.label}><div className="primary-action__copy"><div className="primary-action__icon"><Icon size={24} /></div><span>{action.label}</span><h2>{action.title}</h2><p>{action.description}</p><a href={routeHref(action.route)}>{action.button}</a></div><a className="primary-action__image" href={routeHref(action.route)}><img src={action.image} alt={`${action.title} service`} /></a></article>;
        })}
      </Container>
    </section>
  );
}
