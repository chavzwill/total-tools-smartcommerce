import { BriefcaseBusiness, MessageCircle, Phone } from "lucide-react";
import Container from "../shared/Container";
import { company } from "../../styles/theme";
import "../../styles/utilityBar.css";

export default function UtilityBar() {
  const phoneHref = `tel:${company.phone.replace(/[^0-9+]/g, "")}`;
  const whatsAppHref = `https://wa.me/${company.whatsapp.replace(/[^0-9]/g, "")}`;

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
          <a className="tt-utility__item tt-utility__action" href={phoneHref} aria-label={`Call ${company.phone}`}>
            <Phone size={13} aria-hidden="true" />
            <span>Call</span>
            <span className="tt-utility__detail">{company.phone}</span>
          </a>
          <a
            className="tt-utility__item tt-utility__action"
            href={whatsAppHref}
            target="_blank"
            rel="noreferrer"
            aria-label={`WhatsApp ${company.whatsapp}`}
          >
            <MessageCircle size={13} aria-hidden="true" />
            <span>WhatsApp</span>
            <span className="tt-utility__detail">{company.whatsapp}</span>
          </a>
          <a className="tt-utility__item tt-utility__action" href="#/commercial" aria-label="Commercial Support">
            <BriefcaseBusiness size={13} aria-hidden="true" />
            <span>Commercial</span>
          </a>
        </div>
      </Container>
    </div>
  );
}
