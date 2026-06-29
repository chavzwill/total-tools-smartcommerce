import { CalendarDays, CheckCircle2, ShieldCheck, Truck } from "lucide-react";
import rentalHeroImage from "../assets/rentals/backhoe.jpg";
import Container from "../components/shared/Container";
import RentalTile from "../components/demo/RentalTile";
import { getRentalById, getRentals } from "../data/rentals";
import { money } from "../lib/format";
import { go, routeHref } from "../lib/router";
import "./RentalDetailPage.css";

export function RentalsPage() {
  const rentals = getRentals();
  return <div className="demo-page"><section className="demo-page-hero demo-page-hero--rental"><Container className="demo-rental-hero__inner"><div className="demo-rental-hero__copy"><span>Total Tools Rentals</span><h1>Tools, Equipment, Accessories.<br />Why own them when you can rent them?</h1><p>Reserve professional equipment by the day, week or month with islandwide delivery, commercial pricing and AI-powered recommendations.</p></div><div className="demo-rental-hero__visual" aria-hidden="true"><img src={rentalHeroImage} alt="" /><div><strong>Daily, weekly, monthly</strong><span>Commercial fleet support</span></div></div></Container></section><Container className="demo-page-content"><div className="demo-rental-grid">{rentals.map((rental) => <RentalTile rental={rental} key={rental.id} />)}</div></Container></div>;
}

export function RentalDetailPage({ id }: { id: string }) {
  const rental = getRentalById(id);
  if (!rental) return <div className="demo-empty"><h1>Rental not found</h1><a href={routeHref("/rentals")}>Return to rental fleet</a></div>;
  const details = [
    ["Operating Weight", rental.specs["Operating weight"] || rental.specs.Capacity || "22,000 kg"],
    ["Dig Depth", rental.specs["Reach / power"] || "7.2 m"],
    ["Bucket Capacity", rental.id === "excavator" ? "1.2 m3 general purpose" : rental.specs.Capacity],
    ["Fuel Type", rental.id === "concrete-mixer" ? "Electric" : "Diesel"],
    ["Engine Power", rental.id === "excavator" ? "122 kW / 164 hp" : rental.specs["Reach / power"]],
    ["Attachments", rental.id === "excavator" ? "Bucket, breaker, grading blade" : "Configured by branch"],
    ["Delivery Available", "Islandwide dispatch"],
    ["Operator Available", "On request"],
    ["Insurance", "Damage waiver options"],
    ["Safety Requirements", "PPE and site access review"],
  ];

  return <div className="demo-page"><Container className="demo-detail demo-rental-detail"><div className="demo-detail__gallery"><img src={rental.image} alt={rental.name} /><span>Maintained fleet</span></div><div className="demo-detail__content"><small>{rental.category}</small><h1>{rental.name}</h1><p>{rental.description}</p><p className="demo-available"><CheckCircle2 size={19} /><strong>{rental.availability}</strong><span>{rental.branchAvailability}</span></p><div className="demo-rates demo-rates--large"><span><em>Daily</em><b>{money(rental.dailyRate)}</b><small>per day</small></span><span><em>Weekly</em><b>{money(rental.weeklyRate)}</b><small>per week</small></span><span><em>Monthly</em><b>{money(rental.monthlyRate)}</b><small>per month</small></span></div><form className="demo-reserve-form" onSubmit={(event) => { event.preventDefault(); go(`/rental-confirmation?item=${rental.id}`); }}><label>Start date<input type="date" defaultValue="2026-06-24" required /></label><label>End date<input type="date" defaultValue="2026-06-27" required /></label><label>Branch or delivery<select defaultValue="Islandwide delivery"><option>Islandwide delivery</option><option>Ocho Rios - 102 Main Street, Ocho Rios, P.O. St. Ann</option><option>Kingston - 34 Slipe Road, Kingston 5</option><option>Drax Hall - Lot C6, Drax Hall, St. Ann</option></select></label><label>Full name<input required defaultValue="Jordan Williams" /></label><label>Email<input type="email" required defaultValue="jordan@example.demo" /></label><label>Phone<input required defaultValue="876-555-0147" /></label><button type="submit"><CalendarDays size={18} /> Reserve Equipment</button></form></div><section className="demo-detail__specs"><div className="demo-detail__specs-heading"><span>Fleet specifications</span><h2>Equipment details</h2></div><div className="demo-detail__spec-grid">{details.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></section><section className="demo-detail__services"><div><Truck /><strong>Delivery coordinated</strong><span>Site access confirmed before dispatch</span></div><div><ShieldCheck /><strong>Safety checked</strong><span>Pre-hire inspection on every unit</span></div><div><CheckCircle2 /><strong>Fleet support</strong><span>Help throughout your rental term</span></div></section></Container></div>;
}
