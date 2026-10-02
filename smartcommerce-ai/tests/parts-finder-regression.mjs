import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const fitment = await readFile(new URL("../src/lib/partsFitment.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../src/pages/PartsFinderPage.tsx", import.meta.url), "utf8");
const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const header = await readFile(new URL("../src/components/layout/Header.tsx", import.meta.url), "utf8");
const mobile = await readFile(new URL("../src/components/layout/MobileCommerceNav.tsx", import.meta.url), "utf8");
const branches = await readFile(new URL("../src/lib/shoppingBranch.ts", import.meta.url), "utf8");
const shell = await readFile(new URL("../src/styles/shell.css", import.meta.url), "utf8");
const partsStyles = await readFile(new URL("../src/styles/parts-finder.css", import.meta.url), "utf8");

const invariants = [
  [fitment.includes('const BRAND_FIELDS = ["Brand", "Manufacturer", "Make"]'), "fitment requires an explicit governed brand field"],
  [fitment.includes('if (!brand) return;'), "products without governed brand data are not invented into the parts hierarchy"],
  [fitment.includes("COMPATIBLE_MODEL_FIELDS") && fitment.includes("targetModels = compatibleModels.length"), "part fitment comes from explicit compatible model attributes"],
  [fitment.includes('readFirst(product, PART_NUMBER_FIELDS) || product.sku'), "catalogued parts preserve OEM/manufacturer part numbers with SKU fallback for commerce identity"],
  [fitment.includes("PARENT_PART_FIELDS") && fitment.includes("buildPartTree"), "parent-part relationships support subpart hierarchy"],
  [fitment.includes('assembly: readFirst(product, ASSEMBLY_FIELDS) || "Other parts"'), "parts are grouped into governed assemblies without fabricating an assembly name"],
  [!fitment.includes("product.name.split") && !fitment.includes("product.sku.split"), "brand and model are not guessed from product name or SKU tokenization"],
  [page.includes('from "../lib/branchCatalogue"') && page.includes("loadBranchCatalogue(branch)"), "parts finder uses the grounded branch catalogue adapter"],
  [page.includes("buildPartsFitmentIndex(products)") && page.includes("searchPartsFitment(index, query)"), "parts finder hierarchy and direct search share the governed fitment index"],
  [page.includes("SmartCommerce will not infer or invent compatible parts"), "model empty state explicitly fails closed when spare-part fitment is missing"],
  [page.includes("purchaseBlockedReason") && page.includes("purchasable === false"), "parts finder respects provider commerce purchase blocks"],
  [page.includes("product.currency || \"JMD\"") && page.includes("Intl.NumberFormat"), "parts finder preserves provider currency when rendering price"],
  [app.includes('path === "/parts"') && app.includes("PartsFinderPage"), "application router exposes the parts finder"],
  [app.includes('path === "/parts" || path.startsWith("/category/")'), "parts finder participates in branch-scoped route normalization"],
  [branches.includes('path === "/parts"'), "branch-aware link generation preserves branch context for parts finder"],
  [header.includes('href: "/parts"') && header.includes("Equipment & parts finder"), "desktop Explore discovery exposes the parts finder"],
  [header.includes('/\\b(part|parts|spare|spares|replacement)\\b/.test(normalized)'), "global search routes explicit spare-part intent into the finder"],
  [mobile.includes('path === "/parts"'), "mobile navigation keeps parts finder represented as Shop rather than adding a sixth nav destination"],
  [shell.includes('@import "./parts-finder.css";'), "parts finder styles are loaded through the canonical SmartCommerce shell"],
  [partsStyles.includes(".sc-parts-finder.demo-page .sc-parts-finder__hero>.tt-container") && partsStyles.includes("font-size:36px!important"), "mobile finder hero uses cascade-safe page-specific overrides to preserve fixed-control clearance"],
  [partsStyles.includes(".sc-parts-finder__search-row form") && partsStyles.includes("display:flex"), "narrow finder search stays one row so fixed mobile controls do not cover its submit action"],
];

for (const [ok, label] of invariants) assert.equal(ok, true, label);
console.log(`Equipment and parts finder regression gate passed (${invariants.length} invariants).`);
