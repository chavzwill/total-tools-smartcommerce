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
const referenceCatalog = await readFile(new URL("../src/data/partsReferenceCatalog.ts", import.meta.url), "utf8");
const productTile = await readFile(new URL("../src/components/demo/ProductTile.tsx", import.meta.url), "utf8");
const totalToolsPosAdapter = await readFile(new URL("../src/integrations/totalToolsPosReadAdapter.ts", import.meta.url), "utf8");

const invariants = [
  [fitment.includes('const BRAND_FIELDS = ["Brand", "Manufacturer", "Make"]'), "fitment requires an explicit governed brand field"],
  [fitment.includes("references: ReferenceFitmentModel[] = []"), "fitment index can merge governed reference relationships with commerce products"],
  [fitment.includes('part.product?.id || "reference"'), "reference-only parts have stable non-commerce identities"],
  [fitment.includes("existingIndex >= 0") && fitment.includes("source: existing.source || part.source"), "POS products can enrich a reference mapping without duplicating the part"],
  [referenceCatalog.includes('brand: "STIHL"') && referenceCatalog.includes('model: "MS 362"'), "initial reference catalogue publishes an explicit STIHL MS 362 hierarchy"],
  [referenceCatalog.includes('partNumber: "1135 160 5400"') && referenceCatalog.includes('assembly: "Chain Brake"'), "reference catalogue includes source-backed assembly and OEM part-number facts"],
  [referenceCatalog.includes("ms362Sources.chainBrake") && referenceCatalog.includes("ca6d3d4b-20fb-4ce0-8293"), "reference parts retain exact per-assembly source provenance"],
  [referenceCatalog.includes("These records do not create sellable products, prices, or stock claims"), "reference catalogue explicitly separates fitment facts from commerce authority"],
  [fitment.includes('if (!brand) return;'), "products without governed brand data are not invented into the parts hierarchy"],
  [fitment.includes("COMPATIBLE_MODEL_FIELDS") && fitment.includes("targetModels = compatibleModels.length"), "part fitment comes from explicit compatible model attributes"],
  [fitment.includes('readFirst(product, PART_NUMBER_FIELDS) || product.sku'), "catalogued parts preserve OEM/manufacturer part numbers with SKU fallback for commerce identity"],
  [fitment.includes("commercePartsByIdentity") && fitment.includes("matches.length !== 1"), "governed reference fitment enriches only from one exact brand plus OEM commerce identity"],
  [fitment.includes('const key = \`${normalize(fitment.brand)}::${normalize(part.partNumber)}\`'), "reference-to-commerce joins require exact normalized brand and OEM part number"],
  [fitment.includes("PARENT_PART_FIELDS") && fitment.includes("buildPartTree"), "parent-part relationships support subpart hierarchy"],
  [fitment.includes('assembly: readFirst(product, ASSEMBLY_FIELDS) || "Other parts"'), "parts are grouped into governed assemblies without fabricating an assembly name"],
  [!fitment.includes("product.name.split") && !fitment.includes("product.sku.split"), "brand and model are not guessed from product name or SKU tokenization"],
  [totalToolsPosAdapter.includes('"brand_name"') && totalToolsPosAdapter.includes('"Manufacturer Part Number"') && totalToolsPosAdapter.includes('"manufacturer_part_number"'), "Total Tools POS adapter carries brand and OEM identity into governed product specs"],
  [totalToolsPosAdapter.includes('"model_number"') && totalToolsPosAdapter.includes('{ Model: modelNumber }'), "Total Tools POS adapter carries equipment model identity when supplied by POS"],
  [totalToolsPosAdapter.includes('/api/products/\${encodeURIComponent(query.productId)}') && !totalToolsPosAdapter.includes("search: query.productId"), "branch inventory verification fetches the exact provider product ID instead of text-searching the ID"],
  [page.includes('from "../lib/branchCatalogue"') && page.includes("loadBranchCatalogue(branch)"), "parts finder uses the grounded branch catalogue adapter"],
  [page.includes("buildPartsFitmentIndex(products, referenceFitmentCatalog)") && page.includes("searchPartsFitment(index, query)"), "parts finder hierarchy and direct search share provider products plus governed reference fitment"],
  [page.includes("SmartCommerce will not infer or invent compatible parts"), "model empty state explicitly fails closed when spare-part fitment is missing"],
  [page.includes('import ProductTile from "../components/demo/ProductTile"') && page.includes("<ProductTile"), "POS-linked parts reuse the canonical SmartCommerce product card"],
  [productTile.includes("purchaseBlockedReason") && productTile.includes('product.stockStatus || "Availability unavailable"'), "mapped POS products inherit canonical purchase blocking and stock display"],
  [productTile.includes("formatConnectedPrice(product)") && productTile.includes('product.currency || "JMD"'), "mapped POS products inherit canonical provider currency formatting"],
  [page.includes("POS match required") && page.includes("Reference only"), "reference-only fitment cannot be presented as sellable inventory"],
  [page.includes("Price and stock are unavailable until an exact provider match exists."), "reference-only parts fail closed on price and stock"],
  [page.includes("Search inventory") && page.includes("Ask AI"), "reference parts retain discovery actions without checkout authority"],
  [app.includes('path === "/parts"') && app.includes("PartsFinderPage"), "application router exposes the parts finder"],
  [app.includes('path === "/parts" || path.startsWith("/category/")'), "parts finder participates in branch-scoped route normalization"],
  [branches.includes('path === "/parts"'), "branch-aware link generation preserves branch context for parts finder"],
  [header.includes('href: "/parts"') && header.includes("Equipment & parts finder"), "desktop Explore discovery exposes the parts finder"],
  [header.includes('/\\b(part|parts|spare|spares|replacement)\\b/.test(normalized)'), "global search routes explicit spare-part intent into the finder"],
  [mobile.includes('path === "/parts"'), "mobile navigation keeps parts finder represented as Shop rather than adding a sixth nav destination"],
  [shell.includes('@import "./parts-finder.css";'), "parts finder styles are loaded through the canonical SmartCommerce shell"],
  [page.includes('className="demo-page sc-product-discovery sc-parts-finder"') && page.includes('className="sc-product-discovery__search-row"'), "parts finder reuses the canonical SmartCommerce discovery shell and search row"],
  [page.includes('className="sc-filter-panel sc-parts-assemblies"') && page.includes('className="demo-product-grid sc-parts-product-grid"'), "assembly navigation and results reuse canonical filter-panel and product-grid patterns"],
  [partsStyles.includes("Visual language comes from the existing SmartCommerce catalogue and product-card system"), "parts-specific CSS is explicitly structural rather than a separate visual system"],
  [!partsStyles.includes(".sc-parts-finder__search-row") && !partsStyles.includes(".sc-part-row"), "legacy bespoke search and part-row visual systems are removed"],
  [partsStyles.includes(".sc-part-reference-card__image") && partsStyles.includes(".sc-part-result-context"), "reference-only fitment keeps only minimal native card context styling"],
];

for (const [ok, label] of invariants) assert.equal(ok, true, label);
console.log(`Equipment and parts finder regression gate passed (${invariants.length} invariants).`);
