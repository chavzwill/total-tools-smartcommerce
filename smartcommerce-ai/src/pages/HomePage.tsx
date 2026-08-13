import DealStage from "../components/home/DealStage";
import IntentDiscovery from "../components/home/IntentDiscovery";
import CommerceSections from "../components/home/CommerceSections";
import PrimaryActions from "../components/home/PrimaryActions";
import HeroExperience from "../components/HeroExperience";
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

export default function HomePage(props: Props) {
  const categories = getCategories();
  return (
    <div className="demo-home demo-home--focused sc-home-experience">
      <DealStage />
      <HeroExperience />
      <PrimaryActions />
      <IntentDiscovery />
      <section className="home-categories" aria-labelledby="home-categories-title">
        <Container size="wide">
          <div className="home-categories__heading">
            <div><span>Shop by category</span><h2 id="home-categories-title">Go straight to what you need.</h2></div>
            <a href={routeHref("/categories")}>View all categories</a>
          </div>
          {categories.length ? (
            <div className="home-category-links">
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
