import { routeHref } from "../../lib/router";
import { company } from "../../styles/theme";
import Container from "../shared/Container";
import SocialIcons from "./SocialIcons";

const services = [
  ["Shop Products", "/products"], ["Equipment Rentals", "/rentals"], ["Repairs", "/repairs"],
  ["Product Match AI", "/product-match"], ["Delivery", "/assistant?prompt=Tell%20me%20about%20delivery"]
] as const;
const commercial = [
  ["Fleet Accounts", "/commercial?mode=fleet"], ["Contractor Pricing", "/commercial?mode=pricing"],
  ["Government", "/commercial?mode=government"], ["Business Accounts", "/commercial"]
] as const;
const support = [
  ["FAQs", "/assistant?prompt=Frequently%20asked%20questions"], ["Warranty", "/assistant?prompt=Warranty%20support"],
  ["Returns", "/assistant?prompt=Returns%20support"], ["Contact", `mailto:${company.email}`], ["AI Assistant", "/assistant"]
] as const;

const linkFor = (route: string) => route.startsWith("mailto:") ? route : routeHref(route);

export default function Footer() {
  return <footer className="tt-footer" id="footer">
    <Container size="wide">
      <div className="tt-footer__lead">
        <a href={routeHref("/")} className="tt-footer__text-brand" aria-label="Total Tools Jamaica home"><strong>TOTAL TOOLS JAMAICA</strong><span>{company.subtitle}</span></a>
      </div>
      <div className="tt-footer__grid">
        <section><h2>Branches</h2>{company.branches.map((branch) => <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Total Tools ${branch.name} Jamaica`)}`} target="_blank" rel="noreferrer" key={branch.name}><strong>{branch.name}</strong><span>{branch.address}</span></a>)}</section>
        <section><h2>Services</h2>{services.map(([label, route]) => <a href={routeHref(route)} key={label}>{label}</a>)}</section>
        <section><h2>Commercial</h2>{commercial.map(([label, route]) => <a href={routeHref(route)} key={label}>{label}</a>)}</section>
        <section><h2>Support</h2>{support.map(([label, route]) => <a href={linkFor(route)} key={label}>{label}</a>)}</section>
        <section className="tt-footer__contact"><h2>Contact</h2><a href={`tel:${company.phone.replace(/[^0-9+]/g, "")}`}><span>Phone</span><strong>{company.phone}</strong></a><a href="https://wa.me/18768345300" target="_blank" rel="noreferrer"><span>WhatsApp</span><strong>{company.whatsapp}</strong></a><a href={`mailto:${company.email}`}><span>Email</span><strong>{company.email}</strong></a><div><span>Business Hours</span><strong>Mon-Sat, 7:30 AM-5:00 PM</strong></div><SocialIcons /></section>
      </div>
      <div className="tt-footer__bottom"><span>Copyright 2026 Total Tools Jamaica. All rights reserved.</span><span>Built with Total Tools AI</span></div>
    </Container>
  </footer>;
}
