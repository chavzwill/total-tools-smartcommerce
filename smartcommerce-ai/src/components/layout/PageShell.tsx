import type { ReactNode } from "react";
import "../../styles/experience-upgrade.css";
import "../../styles/catalog-upgrade.css";
import "../../styles/service-upgrade.css";
import "../../styles/experience-v2.css";
import Footer from "./Footer";
import Header from "./Header";
import MobileCommerceNav from "./MobileCommerceNav";
import PromoTicker from "./PromoTicker";
import UtilityBar from "./UtilityBar";

type PageShellProps = {
  children: ReactNode;
};

export default function PageShell({ children }: PageShellProps) {
  return (
    <div className="tt-app-shell">
      <UtilityBar />
      <Header />
      <PromoTicker />
      <main id="main-content">{children}</main>
      <Footer />
      <MobileCommerceNav />
    </div>
  );
}
