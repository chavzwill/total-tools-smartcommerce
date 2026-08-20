import type {
  Branch,
  CommerceProduct,
  InventoryAvailability,
  PlatformApiResult,
  PlatformEntityId,
  PlatformPage,
  ProductCategory,
  RentalAsset,
  RentalReservationResult,
  RepairJob,
  CustomerAccount,
  PlatformOrder,
  PlatformInvoice,
  CommercialQuoteResult,
  PlatformSyncResult,
} from "../platform/contracts.js";
import type {
  PosAdapter,
  PosAdapterContext,
  PosAdapterHealthStatus,
  ProductSearchQuery,
  RentalAssetQuery,
  InventoryAvailabilityQuery,
  RentalAvailabilityQuery,
} from "../platform/posAdapter.js";

const BUSINESS_ID = "preview-total-tools";
const PROVIDER_ID = "preview-catalogue";

const branches: Branch[] = [
  { id: "ocho-rios", businessAccountId: BUSINESS_ID, name: "Ocho Rios", code: "OR", active: true, metadata: { source: "preview_catalogue", liveVerified: false } },
  { id: "drax-hall", businessAccountId: BUSINESS_ID, name: "Drax Hall", code: "DH", active: true, metadata: { source: "preview_catalogue", liveVerified: false } },
  { id: "kingston", businessAccountId: BUSINESS_ID, name: "Kingston", code: "KIN", active: true, metadata: { source: "preview_catalogue", liveVerified: false } },
];

type PreviewProductInput = {
  id: string;
  name: string;
  sku?: string;
  brand?: string;
  category: string;
  price?: number;
  rentable?: boolean;
  purchasable?: boolean;
  tags?: string[];
  description?: string;
  attributes?: Record<string, string | number | boolean | null>;
};

const previewProduct = (input: PreviewProductInput): CommerceProduct => ({
  id: input.id,
  businessAccountId: BUSINESS_ID,
  sku: input.sku,
  name: input.name,
  brand: input.brand,
  categoryIds: [input.category.toLowerCase().replace(/[^a-z0-9]+/g, "-")],
  description: input.description,
  pricing: typeof input.price === "number" ? [{ currency: "JMD", listPrice: input.price, metadata: { source: "preview_catalogue", liveVerified: false } }] : undefined,
  purchasable: input.purchasable ?? true,
  rentable: Boolean(input.rentable),
  repairable: true,
  tags: input.tags,
  attributes: { Category: input.category, ...(input.attributes || {}) },
  active: true,
  metadata: { source: "preview_catalogue", liveVerified: false },
});

const products: CommerceProduct[] = [
  previewProduct({ id: "pulsar-g12", name: "Pulsar 12,000W Dual Fuel Generator", sku: "PGD12000E", brand: "Pulsar", category: "Generators", price: 329999, rentable: true, tags: ["generator", "farm", "power", "electricity"], description: "Heavy-duty dual fuel power for farms, workshops, and emergency backup.", attributes: { Output: "12,000 peak watts", Fuel: "Gasoline or LPG", Runtime: "Up to 12 hours", Start: "Electric" } }),
  previewProduct({ id: "champion-9200", name: "Champion 9,200W Inverter Generator", sku: "CH9200IX", brand: "Champion", category: "Generators", price: 289500, rentable: true, tags: ["generator", "farm", "quiet", "power"], description: "Clean, quiet power for sensitive equipment, trade sites, and backup use.", attributes: { Output: "9,200 peak watts", Noise: "64 dBA", Runtime: "11 hours", Warranty: "3 years" } }),
  previewProduct({ id: "makita-dhp", name: "Makita 18V Brushless Hammer Drill Kit", sku: "DHP486RTJ", brand: "Makita", category: "Power Tools", price: 98500, tags: ["drill", "makita", "cordless", "hammer", "concrete"], description: "High-torque professional drill with two 5Ah batteries and rapid charger.", attributes: { Voltage: "18V", Torque: "130 Nm", Chuck: "13 mm", Batteries: "2 x 5Ah" } }),
  previewProduct({ id: "bosch-gbh", name: "Bosch 1-1/8 in SDS-Plus Rotary Hammer", sku: "GBH2-28L", brand: "Bosch", category: "Power Tools", price: 76500, tags: ["drill", "bosch", "rotary", "hammer", "concrete"], description: "Low-vibration rotary hammer for drilling and light chiselling in concrete.", attributes: { Power: "850W", Impact: "3.2 J", Capacity: "28 mm concrete", Weight: "2.9 kg" } }),
  previewProduct({ id: "milwaukee-impact", name: "Milwaukee M18 FUEL Impact Driver", sku: "2953-22", brand: "Milwaukee", category: "Power Tools", price: 112900, tags: ["drill", "milwaukee", "impact", "driver"], description: "Compact high-output impact driver with intelligent torque control.", attributes: { Voltage: "18V", Torque: "2,000 in-lb", Speed: "3,900 RPM", Batteries: "2 included" } }),
  previewProduct({ id: "karcher-hd", name: "Karcher HD 6/15 M Pressure Washer", sku: "KHD615M", brand: "Karcher", category: "Pressure Washers", price: 214000, rentable: true, tags: ["pressure", "washer", "cleaning"], attributes: { Pressure: "2,175 PSI", Flow: "560 L/h", Power: "3.1 kW", Hose: "10 m" } }),
  previewProduct({ id: "ingco-compressor", name: "INGCO 100L Belt Drive Air Compressor", sku: "AC1002", brand: "INGCO", category: "Air Compressors", price: 168500, tags: ["air", "compressor", "workshop"], attributes: { Tank: "100 L", Motor: "3 HP", Pressure: "8 bar", Supply: "220V" } }),
  previewProduct({ id: "belle-mixer", name: "Belle Minimix 150 Concrete Mixer", sku: "MIX150E", brand: "Belle", category: "Construction", price: 189900, rentable: true, tags: ["concrete", "mixer", "construction", "rental"], attributes: { Drum: "130 L", Motor: "0.75 HP", Mix: "90 L", Weight: "55 kg" } }),
  previewProduct({ id: "toyota-forklift", name: "Toyota 8FGU25 LPG Forklift", sku: "8FGU25-R", brand: "Toyota", category: "Heavy Equipment", price: 4850000, rentable: true, tags: ["forklift", "rental", "heavy", "equipment"], attributes: { Capacity: "2,500 kg", Lift: "4.7 m", Fuel: "LPG", Transmission: "Automatic" } }),
  previewProduct({ id: "cat-excavator", name: "CAT 303.5 CR Mini Excavator", sku: "CAT3035CR", brand: "CAT", category: "Heavy Equipment", price: 8990000, rentable: true, tags: ["excavator", "rental", "heavy", "equipment", "earthmoving"], attributes: { Weight: "3,580 kg", Depth: "3.11 m", Power: "23.6 hp", Width: "1.78 m" } }),
  previewProduct({ id: "jcb-backhoe", name: "JCB 3CX Backhoe Loader", sku: "JCB3CX-PREVIEW", brand: "JCB", category: "Heavy Equipment", rentable: true, purchasable: false, tags: ["backhoe", "loader", "excavator", "rental", "earthmoving", "heavy", "equipment"], description: "Preview rental-fleet backhoe loader record used for SmartCommerce catalogue evaluation.", attributes: { Capacity: "8,070 kg", "Reach / power": "5.5 m" } }),
  previewProduct({ id: "dewalt-laser", name: "DeWalt 12V 3 x 360 Green Laser Level", sku: "DCLE34031D1", brand: "DeWalt", category: "Measuring", price: 129900, tags: ["laser", "level", "construction"], attributes: { Range: "100 m with detector", Accuracy: "+/- 3 mm at 10 m", Lines: "3 x 360 degree", Battery: "12V" } }),
  previewProduct({ id: "lincoln-welder", name: "Lincoln Electric 200A Multi-Process Welder", sku: "POWERTEC200", brand: "Lincoln Electric", category: "Welding", price: 259900, tags: ["welding", "welder", "fabrication"], attributes: { Output: "200A", Processes: "MIG, TIG, Stick", Input: "120/230V", Duty: "40% at 200A" } }),
  previewProduct({ id: "pulsar-1200", name: "Pulsar 1200W Generator", sku: "PG1200S", brand: "Pulsar", category: "Generators", price: 59900, tags: ["generator", "portable", "home", "pulsar"], attributes: { Output: "1,200W", Fuel: "Gasoline", Runtime: "8 hours", Start: "Recoil" } }),
  previewProduct({ id: "pulsar-5250", name: "Pulsar 5250W Generator", sku: "PG5250E", brand: "Pulsar", category: "Generators", price: 179900, tags: ["generator", "portable", "home", "pulsar"], attributes: { Output: "5,250W", Fuel: "Gasoline", Runtime: "10 hours", Start: "Electric" } }),
  previewProduct({ id: "ryobi-2300", name: "Ryobi 2300W Inverter Generator", sku: "RYI2300BTA", brand: "Ryobi", category: "Generators", price: 149500, tags: ["generator", "inverter", "quiet", "ryobi"], attributes: { Output: "2,300W", Noise: "57 dBA", Runtime: "10.3 hours", Start: "Recoil" } }),
  previewProduct({ id: "champion-10kva", name: "Champion 10KVA Generator", sku: "CH10KVA", brand: "Champion", category: "Generators", price: 389900, tags: ["generator", "commercial", "champion", "10kva"], attributes: { Output: "10 kVA", Fuel: "Gasoline", Runtime: "9 hours", Start: "Electric" } }),
  previewProduct({ id: "ifanite-5kva", name: "Ifanite 5KVA Diesel Generator", sku: "IFD5KVA", brand: "Ifanite", category: "Generators", price: 249900, tags: ["generator", "diesel", "ifanite", "5kva"], attributes: { Output: "5 kVA", Fuel: "Diesel", Runtime: "12 hours", Start: "Electric" } }),
  previewProduct({ id: "ifanite-12kva", name: "Ifanite 12KVA Diesel Generator", sku: "IFD12KVA", brand: "Ifanite", category: "Generators", price: 499900, tags: ["generator", "diesel", "ifanite", "12kva"], attributes: { Output: "12 kVA", Fuel: "Diesel", Runtime: "14 hours", Start: "Electric" } }),
  previewProduct({ id: "fixtec-3500", name: "Fixtec 3500W Generator", sku: "FG3500", brand: "Fixtec", category: "Generators", price: 119900, tags: ["generator", "portable", "fixtec", "3500w"], attributes: { Output: "3,500W", Fuel: "Gasoline", Runtime: "9 hours", Start: "Recoil" } }),
  previewProduct({ id: "sigma-5000", name: "Sigma 5000W Generator", sku: "SG5000E", brand: "Sigma", category: "Generators", price: 159900, tags: ["generator", "portable", "sigma", "5000w"], attributes: { Output: "5,000W", Fuel: "Gasoline", Runtime: "10 hours", Start: "Electric" } }),
];

const rentalInput = [
  ["excavator", "cat-excavator", "CAT 320 Excavator", "Earthmoving", 95000, 475000, 1520000, "22,000 kg", "7.2 m"],
  ["backhoe", "jcb-backhoe", "JCB 3CX Backhoe Loader", "Earthmoving", 78000, 390000, 1248000, "8,070 kg", "5.5 m"],
  ["forklift", "toyota-forklift", "Toyota 2.5T Forklift", "Material Handling", 42000, 210000, 672000, "2,500 kg", "4.7 m"],
  ["boom-lift", undefined, "JLG 45ft Boom Lift", "Access", 52000, 260000, 832000, "230 kg basket", "13.7 m"],
  ["scissor-lift", undefined, "Genie 26ft Scissor Lift", "Access", 34000, 170000, 544000, "454 kg basket", "9.9 m"],
  ["telehandler", undefined, "JCB 540-170 Telehandler", "Material Handling", 69000, 345000, 1104000, "4,000 kg", "17 m"],
  ["roller", undefined, "Bomag 5T Smooth Drum Roller", "Compaction", 61000, 305000, 976000, "5,000 kg", "1.68 m drum"],
  ["skid-steer", undefined, "Bobcat S650 Skid Steer", "Earthmoving", 49000, 245000, 784000, "1,220 kg", "3.1 m"],
  ["concrete-mixer", "belle-mixer", "Belle 150L Concrete Mixer", "Concrete", 8500, 42500, 136000, "90 L mix", "Electric"],
  ["lighting-tower", undefined, "Atlas Copco LED Lighting Tower", "Site Services", 18000, 90000, 288000, "4 x 350W LED", "8 m mast"],
  ["site-generator", "pulsar-g12", "60 kVA Silent Site Generator", "Power", 26000, 130000, 416000, "60 kVA", "Diesel"],
  ["water-pump", undefined, "3 in Diesel Trash Water Pump", "Pumps", 12000, 60000, 192000, "1,200 L/min", "7 m suction"],
] as const;

const rentals: RentalAsset[] = rentalInput.map(([id, productId, name, category, dailyRate, weeklyRate, monthlyRate, capacity, reach]) => ({
  id,
  businessAccountId: BUSINESS_ID,
  productId,
  name,
  status: "unknown",
  ratePlans: [{ currency: "JMD", dailyRate, weeklyRate, monthlyRate, metadata: { source: "preview_catalogue", liveVerified: false } }],
  attributes: { category, Capacity: capacity, "Reach / power": reach, Delivery: "Islandwide", description: `Preview rental catalogue record for ${name}.` },
  metadata: { source: "preview_catalogue", liveVerified: false },
}));

const categories: ProductCategory[] = Array.from(new Set(products.map((product) => String(product.attributes?.Category || "Catalogue"))))
  .map((name) => ({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), businessAccountId: BUSINESS_ID, name, active: true, metadata: { source: "preview_catalogue", liveVerified: false } }));

const normalize = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const searchTokens = (value: unknown) => normalize(value).split(/\s+/).filter((token) => token.length > 1);
const page = <T>(items: T[], pageSize = items.length): PlatformPage<T> => ({ items: items.slice(0, Math.max(1, pageSize || items.length)), total: items.length, page: 1, pageSize, hasNextPage: false });
const unsupportedWrite = <T>(operation: string): PlatformApiResult<T> => ({ success: false, error: { code: "PREVIEW_WRITE_UNAVAILABLE", message: `${operation} is unavailable in preview catalogue mode.`, retryable: false } });

function productHaystack(product: CommerceProduct) {
  return normalize([
    product.name,
    product.sku,
    product.brand,
    product.description,
    ...(product.tags || []),
    ...(product.categoryIds || []),
    ...Object.entries(product.attributes || {}).flatMap(([key, value]) => [key, value]),
  ].join(" "));
}

function searchScore(product: CommerceProduct, search?: string) {
  const tokens = searchTokens(search);
  if (!tokens.length) return 1;
  const haystack = productHaystack(product);
  const matches = tokens.filter((token) => haystack.includes(token)).length;
  if (!matches) return 0;
  return matches / tokens.length + (normalize(product.name).includes(normalize(search)) ? 1 : 0);
}

function previewInventory(productId: PlatformEntityId, branchId?: PlatformEntityId): InventoryAvailability[] {
  return [{
    productId,
    branchId,
    status: "unknown",
    metadata: { source: "preview_catalogue", liveVerified: false, note: "Preview catalogue does not represent verified live branch inventory." },
  }];
}

export function createPreviewCommerceAdapter(): PosAdapter {
  return {
    async healthCheck(context): Promise<PlatformApiResult<PosAdapterHealthStatus>> {
      return { success: true, data: { providerId: PROVIDER_ID, businessAccountId: context.businessAccountId || BUSINESS_ID, connected: true, checkedAt: new Date().toISOString(), displayName: "SmartCommerce Preview Catalogue", capabilities: { branches: true, categories: true, products: true, inventory: true, pricing: true, rentals: true, realTimeAvailability: false, metadata: { preview: true } }, message: "Preview catalogue source is active. Live Total Tools POS inventory and availability are not connected.", metadata: { preview: true, liveVerified: false } } };
    },
    async listBranches() { return { success: true, data: branches }; },
    async listCategories(_context, query) {
      const result = query?.search ? categories.filter((item) => normalize(item.name).includes(normalize(query.search))) : categories;
      return { success: true, data: page(result, query?.pageSize || result.length) };
    },
    async searchProducts(_context, query: ProductSearchQuery = {}) {
      const ranked = products
        .filter((product) => query.includeInactive || product.active)
        .filter((product) => !query.sku || normalize(product.sku) === normalize(query.sku))
        .filter((product) => !query.barcode || normalize(product.barcode) === normalize(query.barcode))
        .filter((product) => !query.categoryId || product.categoryIds?.includes(query.categoryId))
        .filter((product) => !query.tags?.length || query.tags.every((tag) => (product.tags || []).some((value) => normalize(value) === normalize(tag))))
        .map((product) => ({ product, score: searchScore(product, query.search) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((item) => item.product);
      return { success: true, data: page(ranked, query.pageSize || 20) };
    },
    async getProductById(_context, productId) {
      const product = products.find((item) => item.id === productId);
      return product ? { success: true, data: product } : { success: false, error: { code: "PRODUCT_NOT_FOUND", message: "Product was not found in the preview catalogue.", retryable: false } };
    },
    async getInventoryAvailability(_context, query: InventoryAvailabilityQuery) { return { success: true, data: previewInventory(query.productId, query.branchId) }; },
    async listRentalAssets(_context, query: RentalAssetQuery = {}) {
      const filtered = rentals.filter((asset) => !query.productId || asset.productId === query.productId)
        .filter((asset) => !query.branchId || true)
        .filter((asset) => !query.status || query.status === "available" || asset.status === query.status);
      return { success: true, data: page(filtered, query.pageSize || 20) };
    },
    async getRentalAssetById(_context, rentalAssetId) {
      const asset = rentals.find((item) => item.id === rentalAssetId);
      return asset ? { success: true, data: asset } : { success: false, error: { code: "RENTAL_ASSET_NOT_FOUND", message: "Rental asset was not found in the preview catalogue.", retryable: false } };
    },
    async getRentalAvailability(_context, query: RentalAvailabilityQuery) {
      const productId = query.productId || rentals.find((item) => item.id === query.rentalAssetId)?.productId || String(query.rentalAssetId || "preview-rental");
      return { success: true, data: previewInventory(productId, query.branchId) };
    },
    async createRentalReservation(): Promise<PlatformApiResult<RentalReservationResult>> { return unsupportedWrite("Rental reservation creation"); },
    async createRepairRequest(): Promise<PlatformApiResult<RepairJob>> { return unsupportedWrite("Repair request creation"); },
    async getRepairJobById(): Promise<PlatformApiResult<RepairJob>> { return unsupportedWrite("Repair job lookup"); },
    async createCommercialQuote(): Promise<PlatformApiResult<CommercialQuoteResult>> { return unsupportedWrite("Commercial quote creation"); },
    async createCustomer(): Promise<PlatformApiResult<CustomerAccount>> { return unsupportedWrite("Customer creation"); },
    async getCustomerById(): Promise<PlatformApiResult<CustomerAccount>> { return unsupportedWrite("Customer lookup"); },
    async createOrder(): Promise<PlatformApiResult<PlatformOrder>> { return unsupportedWrite("Order creation"); },
    async getOrderById(): Promise<PlatformApiResult<PlatformOrder>> { return unsupportedWrite("Order lookup"); },
    async createInvoice(): Promise<PlatformApiResult<PlatformInvoice>> { return unsupportedWrite("Invoice creation"); },
    async handleWebhook(): Promise<PlatformApiResult<PlatformSyncResult>> { return unsupportedWrite("Webhook handling"); },
  };
}

export function previewCatalogueEnabled() {
  return process.env.VERCEL_ENV === "preview" || process.env.SMARTCOMMERCE_ENABLE_PREVIEW_CATALOGUE === "1";
}

export const PREVIEW_PROVIDER_ID = PROVIDER_ID;
export const PREVIEW_BUSINESS_ID = BUSINESS_ID;
