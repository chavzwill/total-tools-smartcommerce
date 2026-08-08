import Container from "../shared/Container";
import { company } from "../../styles/theme";

export default function UtilityBar() {
  return (
    <div className="tt-utility">
      <Container size="wide" className="tt-utility__inner">
        <div className="tt-utility__branches" aria-label="Branch locations">
          {company.branches.map((branch) => (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                `Total Tools ${branch.name} Jamaica`
              )}`}
              target="_blank"
              rel="noreferrer"
              key={branch.name}
            >
              {branch.name}
            </a>
          ))}
        </div>
        <div className="tt-utility__links">
          <span>Islandwide Delivery</span>
          <a href={`tel:${company.whatsapp.replace(/[^0-9+]/g, "")}`}>WhatsApp {company.whatsapp}</a>
          <a href="#/commercial">Commercial Accounts</a>
        </div>
      </Container>
    </div>
  );
}
