import { Bot, CheckCircle2, PackageCheck, ShieldCheck, Store, Truck, Wrench } from "lucide-react";
import mascot from "../../assets/brand/mascot-illustrated.jpeg";
import repairImage from "../../assets/services/repairs-service.jpg";
import { getCategories, getProducts } from "../../data/products";
import { getRentals } from "../../data/rentals";
import { routeHref } from "../../lib/router";
import CategoryCard from "../demo/CategoryCard";
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

const promises = [
  [PackageCheck, "100,000+ Products In Stock"], [Store, "3 Branches Islandwide"],
  [Truck, "Same-Day Delivery in Kingston"], [Bot, "Expert Advice and AI Support"],
  [ShieldCheck, "Secure Shopping Experience"]
] as const;

const aiExamples = [
  ["Find a generator for my house", "/assistant?prompt=Find%20me%20a%20generator%20for%20my%20house"],
  ["Compare these drills", "/search?q=drill"], ["Rent equipment for tomorrow", "/rentals"],
  ["Match this image", "/product-match"], ["Recommend safety gear", "/assistant?prompt=Recommend%20safety%20gear"]
] as const;

export default function CommerceSections(props: Props) {
  const categories = getCategories();
  const products = getProducts();
  const rentals = getRentals();

  return <>
    <section className="home-promises"><Container size="wide">{promises.map(([Icon, label]) => <div key={label}><Icon size={18} /><span>{label}</span></div>)}</Container></section>
    <section className="home-merch-section"><Container size="wide"><SectionHeader eyebrow="Featured Categories" title="Shop by the work ahead." description="Fast paths into the departments Jamaican homes, trades, and businesses rely on." /><div className="home-featured-categories">{categories.slice(0, 6).map((category) => <CategoryCard category={category} key={category.name} />)}</div><a className="demo-text-link" href={routeHref("/categories")}>Browse all categories</a></Container></section>
    <section className="home-merch-section home-merch-section--soft"><Container size="wide"><div className="home-section-line"><SectionHeader eyebrow="Popular Products" title="In stock and ready to work." /><a href={routeHref("/products")}>View all products</a></div><div className="home-product-rail">{products.slice(0, 6).map((product) => <ProductTile product={product} wished={props.wishlist.includes(product.id)} compared={props.compared.includes(product.id)} onWishlist={props.onWishlist} onCompare={props.onCompare} onAdd={props.onAdd} key={product.id} />)}</div></Container></section>
    <section className="home-merch-section"><Container size="wide"><div className="home-section-line"><SectionHeader eyebrow="Rental Highlights" title="Commercial equipment. Flexible terms." description="Maintained equipment with transparent daily, weekly, and monthly pricing." /><a href={routeHref("/rentals")}>View rental catalogue</a></div><div className="home-rental-grid">{rentals.slice(0, 6).map((rental) => <RentalTile rental={rental} key={rental.id} />)}</div></Container></section>
    <section className="home-repair-highlight"><Container size="wide"><div className="home-repair-image"><img src={repairImage} alt="Total Tools technician repairing professional equipment" /></div><div className="home-repair-copy"><span>Repairs and Service</span><h2>Keep the equipment you depend on working.</h2><p>Certified diagnostics, scheduled maintenance, service plans, and genuine parts support across tools, generators, pressure washers, pumps, and compressors.</p><ul><li><CheckCircle2 size={17} /> Diagnostics and inspections</li><li><CheckCircle2 size={17} /> Preventive maintenance plans</li><li><CheckCircle2 size={17} /> Genuine replacement parts</li></ul><div><a href={routeHref("/repairs")}>Book Repair</a><a href={routeHref("/repairs?mode=inspection")}>Book Inspection</a><a href={routeHref("/account")}>Track Repair</a></div></div></Container></section>
    <section className="home-ai-showcase"><Container size="wide"><div className="home-ai-copy"><span>Total Tools AI</span><h2>Ask once. Move the job forward.</h2><p>From choosing the right generator to finding a replacement part by photo, the assistant connects customers to real products and services.</p><div>{aiExamples.map(([label, route]) => <a href={routeHref(route)} key={label}>{label}</a>)}</div></div><img src={mascot} alt="Total Tools AI guide" /><div className="home-ai-capabilities"><Wrench size={26} /><strong>One intelligent starting point</strong><p>Product recommendations, rental availability, repair booking, comparisons, and image matching.</p><a href={routeHref("/assistant")}>Open AI Assistant</a></div></Container></section>
  </>;
}
