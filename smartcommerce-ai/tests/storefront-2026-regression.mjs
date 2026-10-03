import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const home = await readFile(new URL("../src/pages/HomePageV4.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles/storefront-2026.css", import.meta.url), "utf8");
const header = await readFile(new URL("../src/components/layout/Header.tsx", import.meta.url), "utf8");
const footer = await readFile(new URL("../src/components/layout/Footer.tsx", import.meta.url), "utf8");
const ticker = await readFile(new URL("../src/components/layout/PromoTicker.tsx", import.meta.url), "utf8");
const shell = await readFile(new URL("../src/components/layout/PageShell.tsx", import.meta.url), "utf8");

const invariants = [
  [app.includes('import HomePageV4 from "./pages/HomePageV4"'), "2026 storefront is the active homepage"],
  [!app.includes('import HomePageV3 from "./pages/HomePageV3"'), "legacy homepage is not in the active application graph"],
  [home.includes('heroImage from "../assets/smartcommerce-tools-optimized.jpg"'), "homepage uses the optimized single hero asset"],
  [!home.includes("setInterval") && !home.includes("useEffect"), "homepage does not run autonomous carousel timers"],
  [home.includes('href={routeHref("/parts")}'), "equipment and parts finder is first-class on the homepage"],
  [home.includes("getProducts().slice(0, 4)") && home.includes("getRentals().slice(0, 3)"), "initial merchandising is intentionally bounded"],
  [styles.includes("content-visibility: auto"), "below-fold storefront sections are render-deferred"],
  [styles.includes("backdrop-filter: none"), "new storefront avoids expensive blur effects"],
  [header.includes("total-tools-logo-optimized.png"), "header uses optimized brand artwork"],
  [footer.includes("total-tools-logo-optimized.png"), "footer uses optimized brand artwork"],
  [!ticker.includes("setInterval"), "shopping signal rail does not auto-rotate in the background"],
  [ticker.includes("Previous update") && ticker.includes("Next update"), "manual signal navigation remains available"],
  [!shell.includes("PromoTicker"), "legacy rotating signal rail is removed from the active shell"],
  [!shell.includes("UtilityBar"), "legacy utility strip is removed from the active customer shell"],
];

for (const [ok, label] of invariants) assert.equal(ok, true, label);
console.log(`Storefront 2026 regression gate passed (${invariants.length} invariants).`);
