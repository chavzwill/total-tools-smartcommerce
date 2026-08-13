import HeroExperienceV3 from "../components/HeroExperienceV3";
import DealStage from "../components/home/DealStage";
import PrimaryActions from "../components/home/PrimaryActions";
import IntentDiscovery from "../components/home/IntentDiscovery";
import CommerceSections from "../components/home/CommerceSections";
import Container from "../components/shared/Container";
import { getCategories } from "../data/products";
import { slugify } from "../lib/format";
import { routeHref } from "../lib/router";

type Props = {
  wishlist: string[];
  compared: string[];
  onWishlist: (id: string) => void;
  onCompare: (id: string) => void;
  onAdd: (id: string) => void;
};

export default function HomePageV3(props: Props) {
  const categories = getCategories();
  return (
    <div className="v3-home">
      <HeroExperienceV3 />
      <DealStage />
      <PrimaryActions />
      <IntentDiscovery />
      <section className="v3-category-section" aria-labelledby="v3-categories-title">
        <Container size="wide">
          <div className="v3-section-heading">
            <div><span>SHOP BY CATEGORY</span><h2 id="v3-categories-title">Straight to the tools that move the job.</h2></div>
            <a href={routeHref("/categories")}>View all categories</a>
          </div>
          {categories.length ? (
            <div className="v3-category-grid">
              {categories.map((category) => (
                <a href={routeHref(`/category/${slugify(category.name)}`)} key={category.name}>
                  <b>{category.icon}</b><span>{category.name}</span>
                </a>
              ))}
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
