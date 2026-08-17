import { Droplets, Flame, Hammer, Package, ShieldCheck, Sparkles, Zap } from "lucide-react";
import HeroExperienceV3 from "../components/HeroExperienceV3";
import DealStage from "../components/home/DealStage";
import PrimaryActions from "../components/home/PrimaryActions";
import IntentDiscovery from "../components/home/IntentDiscovery";
import CommerceSections from "../components/home/CommerceSections";
import Container from "../components/shared/Container";
import { getCategories } from "../data/products";
import { slugify } from "../lib/format";
import { routeHref } from "../lib/router";
import "../styles/home-refinement.css";

type Props = {
  wishlist: string[];
  compared: string[];
  onWishlist: (id: string) => void;
  onCompare: (id: string) => void;
  onAdd: (id: string) => void;
};

function categoryIcon(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes("generator")) return Zap;
  if (normalized.includes("electrical")) return Zap;
  if (normalized.includes("safety")) return ShieldCheck;
  if (normalized.includes("clean")) return Sparkles;
  if (normalized.includes("weld")) return Flame;
  if (normalized.includes("pressure") || normalized.includes("washer")) return Droplets;
  if (normalized.includes("tool") || normalized.includes("drill") || normalized.includes("saw")) return Hammer;
  return Package;
}

export default function HomePageV3(props: Props) {
  const categories = getCategories();
  const featuredCategories = categories.slice(0, 8);

  return (
    <div className="v3-home">
      <HeroExperienceV3 />
      <DealStage />
      <PrimaryActions />
      <IntentDiscovery />
      <section className="v3-category-section v3-category-section--compact" aria-labelledby="v3-categories-title">
        <Container size="wide">
          <div className="v3-section-heading v3-section-heading--compact">
            <div><span>SHOP BY CATEGORY</span><h2 id="v3-categories-title">Straight to the tools that move the job.</h2></div>
            <a href={routeHref("/categories")}>View all categories</a>
          </div>
          {featuredCategories.length ? (
            <div className="v3-category-grid v3-category-grid--icons">
              {featuredCategories.map((category) => {
                const Icon = categoryIcon(category.name);
                return (
                  <a href={routeHref(`/category/${slugify(category.name)}`)} key={category.name}>
                    <span className="v3-category-icon" aria-hidden="true"><Icon size={24} strokeWidth={2} /></span>
                    <span className="v3-category-name">{category.name}</span>
                  </a>
                );
              })}
            </div>
          ) : (
            <div className="sc-provider-empty">
              <strong>Categories will appear when the connected provider returns them.</strong>
              <a href={routeHref("/assistant")}>Ask SmartCommerce for help</a>
            </div>
          )}
        </Container>
      </section>
      <CommerceSections {...props} />
    </div>
  );
}
