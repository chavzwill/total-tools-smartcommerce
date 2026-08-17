import { CheckCircle2, Wrench } from "lucide-react";
import mascot from "../../assets/brand/mascot-illustrated.jpeg";
import repairImage from "../../assets/services/repairs-service.jpg";
import { getProducts } from "../../data/products";
import { getCommerceDataMode } from "../../data/providerMode";
import { getRentals } from "../../data/rentals";
import { routeHref } from "../../lib/router";
import { company } from "../../styles/theme";
import ProductTile from "../demo/ProductTile";
import RentalTile from "../demo/RentalTile";
import Container from "../shared/Container";
import SectionHeader from "../shared/SectionHeader";

type Props = {
  wishlist: string[];
  compared: string[];
  onWishlist: (id: string) => void;
  onCompare: (id: string) => void;
  onAdd: (id: string) => void;
};

const aiExamples = [
  ["I need a generator for my house", "/assistant?prompt=I%20need%20a%20generator%20for%20my%20house"],
  ["Compare drills", "/search?q=drill"],
  ["Rent equipment", "/rentals"],
  ["Find from a photo", "/product-match"],
] as const;

export default function CommerceSections(props: Props) {
  const products = getProducts();
  const rentals = getRentals();
  const connected = getCommerceDataMode() === "connected";

  return <>
    <section className="home-merch-section" id="rental-preview">
      <Container size="wide">
        <div className="home-section-line"><SectionHeader eyebrow="Rentals" title="Rent the Right Machine." description="Choose by capability, set your dates and location, then move toward verified availability." /><a href={routeHref("/rentals")}>Plan a rental</a></div>
        {rentals.length ? <div className="home-rental-grid">{rentals.slice(0, 6).map((rental) => <RentalTile rental={rental} key={rental.id} />)}</div> : <div className="sc-provider-empty"><strong>No rental assets have been returned yet.</strong><a href={routeHref("/rentals")}>Open rental planner</a></div>}
      </Container>
    </section>

    <section className="home-merch-section home-merch-section--soft">
      <Container size="wide">
        <div className="home-section-line"><SectionHeader eyebrow={connected ? "Connected products" : "Catalogue preview"} title="Tools That Get It Done." description={connected ? "Explore products with live provider price and availability where returned." : "Explore the catalogue experience now. Live price and branch stock appear when a provider is connected."} /><a href={routeHref("/products")}>Explore products</a></div>
        {products.length ? <div className="home-product-rail">{products.slice(0, 6).map((product) => <ProductTile product={product} wished={props.wishlist.includes(product.id)} compared={props.compared.includes(product.id)} onWishlist={props.onWishlist} onCompare={props.onCompare} onAdd={props.onAdd} key={product.id} />)}</div> : <div className="sc-provider-empty"><strong>No products returned by the connected provider.</strong><a href={routeHref("/assistant")}>Ask SmartCommerce for another path</a></div>}
      </Container>
    </section>

    <section className="home-repair-highlight">
      <Container size="wide">
        <div className="home-repair-image"><img src={repairImage} alt="Technician servicing professional equipment" loading="lazy" decoding="async" /></div>
        <div className="home-repair-copy">
          <span>Repairs & service</span>
          <h2>Fix What You Own.</h2>
          <p>Identify the equipment, describe the fault, add photos for context, and start a repair request where that capability is connected.</p>
          <ul><li><CheckCircle2 size={17} /> Equipment and model details</li><li><CheckCircle2 size={17} /> Issue description and photo context</li><li><CheckCircle2 size={17} /> Provider status when supported</li></ul>
          <div><a href={routeHref("/repairs")}>Start Repair Request</a><a href={routeHref("/assistant?prompt=Help%20me%20describe%20an%20equipment%20fault")}>Ask AI</a></div>
        </div>
      </Container>
    </section>

    <section className="sc-commercial-home">
      <Container size="wide">
        <div><span>Total Tools Commercial</span><h2>Built for Bigger Jobs.</h2><p>Move from one-off shopping to structured support for projects, crews, sites, volume needs, and commercial requests.</p></div>
        <div><a href={routeHref("/commercial?mode=quote")}>Request commercial support</a><a href={routeHref("/rentals")}>Plan fleet rentals</a><a href={`tel:${company.phone.replace(/[^0-9+]/g, "")}`}>Call Total Tools</a></div>
      </Container>
    </section>

    <section className="home-ai-showcase">
      <Container size="wide">
        <div className="home-ai-copy"><span>SmartCommerce AI</span><h2>Tell Us the Job.</h2><p>Describe the work and SmartCommerce can route you toward products, rentals, repairs, or commercial support using connected provider data where configured.</p><div>{aiExamples.map(([label, route]) => <a href={routeHref(route)} key={label}>{label}</a>)}</div></div>
        <img src={mascot} alt="Total Tools SmartCommerce guide" loading="lazy" decoding="async" />
        <div className="home-ai-capabilities"><Wrench size={26} /><strong>One intelligent starting point</strong><p>Search, job-based guidance, comparison, photo matching, and service routing without inventing provider facts.</p><a href={routeHref("/assistant")}>Ask SmartCommerce</a></div>
      </Container>
    </section>
  </>;
}
