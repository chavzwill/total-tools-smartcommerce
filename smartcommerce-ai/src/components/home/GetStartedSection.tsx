import mascot from "../../assets/brand/mascot-illustrated.jpeg";
import rentalsImage from "../../assets/services/equipment-rentals.jpg";
import repairsImage from "../../assets/services/repairs-service.jpg";
import productsImage from "../../assets/services/shop-products.jpg";
import Button from "../shared/Button";
import Container from "../shared/Container";
import SectionHeader from "../shared/SectionHeader";
import { go } from "../../lib/router";

type ServiceCard = {
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  features: string[];
  action: string;
  id: string;
  route: string;
};

const serviceCards: ServiceCard[] = [
  {
    id: "products-entry",
    title: "Shop Products",
    description: "Browse thousands of professional tools, hardware, electrical supplies, plumbing, safety gear, generators, welding equipment, landscaping products, industrial supplies, and accessories.",
    image: productsImage,
    imageAlt: "Modern showroom with professional tools and industrial equipment",
    features: ["Real-time inventory", "AI recommendations", "Store pickup", "Islandwide delivery", "Secure checkout"],
    action: "Browse Products"
    , route: "/products"
  },
  {
    id: "rentals-entry",
    title: "Equipment Rentals",
    description: "Reserve professional equipment for projects of every size. Rent by the day, week, or month.",
    image: rentalsImage,
    imageAlt: "Commercial fleet of excavators, lifts, forklifts, and construction equipment",
    features: ["Commercial fleet", "Flexible rental terms", "Fast reservations", "Islandwide delivery", "Commercial pricing"],
    action: "Browse Rentals"
    , route: "/rentals"
  },
  {
    id: "repairs-entry",
    title: "Repairs & Service",
    description: "Book inspections, maintenance, diagnostics, repairs, and servicing for tools, generators, compressors, pumps, pressure washers, and industrial equipment.",
    image: repairsImage,
    imageAlt: "Certified technician servicing professional equipment in a clean workshop",
    features: ["Certified technicians", "Genuine replacement parts", "Equipment diagnostics", "Maintenance plans", "Repair tracking"],
    action: "Book Repair"
    , route: "/repairs"
  }
];

const aiPrompts = [
  "I need a generator for my farm.",
  "Rent an excavator tomorrow.",
  "Find me a pressure washer.",
  "Recommend a welding machine.",
  "Book a repair."
];

function StandardServiceCard({ card }: { card: ServiceCard }) {
  return (
    <article className="tt-entry-card tt-entry-card--standard" id={card.id}>
      <div className="tt-entry-card__image"><img src={card.image} alt={card.imageAlt} loading="lazy" /></div>
      <div className="tt-entry-card__body">
        <h3>{card.title}</h3><p>{card.description}</p>
        <ul>{card.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
        <Button type="button" onClick={() => go(card.route)}>{card.action} {"->"}</Button>
      </div>
    </article>
  );
}

function AIServiceCard() {
  return (
    <article className="tt-entry-card tt-entry-card--ai" id="ai-entry">
      <div className="tt-ai-card__visual"><img src={mascot} alt="Total Tools AI expert" loading="lazy" /><div className="tt-speech-bubble">Hi! Tell me what you are working on.</div></div>
      <div className="tt-entry-card__body">
        <h3>Ask Total Tools AI</h3>
        <div className="tt-ai-prompts">{aiPrompts.map((prompt) => <button type="button" key={prompt}>{prompt}</button>)}</div>
        <Button type="button" onClick={() => go("/assistant")}>Start AI Assistant {"->"}</Button>
      </div>
    </article>
  );
}

export default function GetStartedSection() {
  return (
    <section className="tt-get-started" id="services" aria-labelledby="get-started-title">
      <Container>
        <SectionHeader eyebrow="Get Started" title="How can we help today?" description="Whether you are buying tools, renting heavy equipment, booking repairs, or looking for expert advice, choose the fastest way to get started." />
        <div className="tt-entry-grid">
          {serviceCards.map((card) => <StandardServiceCard card={card} key={card.title} />)}
          <AIServiceCard />
        </div>
        <div className="tt-entry-cta">
          <h3>Not sure where to start?</h3>
          <p>Our AI Assistant helps you find products, compare equipment, recommend rentals, troubleshoot problems, and answer questions in seconds.</p>
          <div><Button type="button" onClick={() => go("/assistant")}>Ask AI</Button><Button type="button" variant="ghost" onClick={() => go("/repairs")}>Talk to an Expert</Button></div>
        </div>
      </Container>
    </section>
  );
}
