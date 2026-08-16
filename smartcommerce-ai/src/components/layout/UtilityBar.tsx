import Container from "../shared/Container";
import { company } from "../../styles/theme";
import "../../styles/utilityBar.css";

export default function UtilityBar() {
  return (
    <div className="tt-utility">
      <Container size="wide" className="tt-utility__inner">
        <div className="tt-utility__branches" aria-label="Branch locations">
          <span className="tt-utility__label">Branches</span>
          {company.branches.map((branch) => (
            <a
              className="tt-utility__item"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Total Tools ${branch.name} Jamaica`)}`}
              target="_blank"
              rel="noreferrer"
              key={branch.name}
              title={branch.address}
            >
              {branch.name}
            </a>
          ))}
        </div>
        <div className="tt-utility__links" aria-label="Contact options">
          <a className="tt-utility__item" href={`tel:${company.phone.replace(/[^0-9+]/g, "")}`}>Call {company.phone}</a>
          <a className="tt-utility__item" href={`https://wa.me/${company.whatsapp.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer">WhatsApp {company.whatsapp}</a>
          <a className="tt-utility__item tt-utility__commercial" href="#/commercial" aria-label="Commercial Support">
            Commercial<span className="tt-utility__commercial-suffix"> Support</span>
          </a>
        </div>
      </Container>
    </div>
  );
}
