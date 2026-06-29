import type { ReactNode } from "react";
import Footer from "./Footer";
import Header from "./Header";
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
    </div>
  );
}