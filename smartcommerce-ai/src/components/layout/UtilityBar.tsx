import Container from "../shared/Container";
import { company } from "../../styles/theme";

export default function UtilityBar() {
  return (
    <div className="tt-utility">
      <Container size="wide" className="tt-utility__inner">
        <div className="tt-utility__branches" aria-label="Branch locations">
          {company.branches.map((branch) => <span key={branch.name}>{branch.name}</span>)}
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
