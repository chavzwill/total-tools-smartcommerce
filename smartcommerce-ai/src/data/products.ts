import generatorImage from "../assets/generator-optimized.jpg";
import portableGeneratorImage from "../assets/products/portable-generator.jpg";
import cordlessDrillImage from "../assets/products/cordless-drill.jpg";
import rotaryHammerImage from "../assets/products/rotary-hammer.jpg";
import impactDriverImage from "../assets/products/impact-driver.jpg";
import pressureWasherImage from "../assets/products/pressure-washer.jpg";
import compressorImage from "../assets/products/air-compressor.jpg";
import concreteMixerImage from "../assets/products/concrete-mixer.jpg";
import forkliftImage from "../assets/products/forklift.jpg";
import excavatorImage from "../assets/products/mini-excavator.jpg";
import laserLevelImage from "../assets/products/laser-level.jpg";
import weldingMachineImage from "../assets/products/welding-machine.jpg";
import electricalCategoryImage from "../assets/categories/electrical.jpg";
import safetyCategoryImage from "../assets/categories/safety.jpg";
import cleaningCategoryImage from "../assets/categories/cleaning.jpg";
import handToolsCategoryImage from "../assets/categories/hand-tools.jpg";
import plumbingCategoryImage from "../assets/categories/plumbing.jpg";
import outdoorCategoryImage from "../assets/categories/outdoor-equipment.jpg";
import {
  createProductionSyncClient,
  createSmartCommercePlatformApi,
  type ApiClientOptions,
} from "../apiClient";
import type {
  CommerceProduct,
  PlatformApiResult,
  PlatformSyncResult,
  PosAdapterContext,
  ProductCategory,
} from "../platform";
import type { Category, Product } from "../types";

const temporaryProductFallback: Product[] = [
  { id: "pulsar-g12", name: "Pulsar 12,000W Dual Fuel Generator", sku: "PGD12000E", category: "Generators", department: "Power Equipment", price: 329999, stockStatus: "In stock - Kingston", badge: "Farm ready", image: portableGeneratorImage, tags: ["generator", "farm", "power", "electricity"], rating: 4.8, reviews: 86, rentable: true, description: "Heavy-duty dual fuel power for farms, workshops, and emergency backup.", specs: { Output: "12,000 peak watts", Fuel: "Gasoline or LPG", Runtime: "Up to 12 hours", Start: "Electric" } },
  { id: "champion-9200", name: "Champion 9,200W Inverter Generator", sku: "CH9200IX", category: "Generators", department: "Power Equipment", price: 289500, stockStatus: "Available at select branches", badge: "Quiet power", image: generatorImage, tags: ["generator", "farm", "quiet", "power"], rating: 4.7, reviews: 51, rentable: true, description: "Clean, quiet power for sensitive equipment, trade sites, and backup use.", specs: { Output: "9,200 peak watts", Noise: "64 dBA", Runtime: "11 hours", Warranty: "3 years" } },
  { id: "makita-dhp", name: "Makita 18V Brushless Hammer Drill Kit", sku: "DHP486RTJ", category: "Power Tools", department: "Power Tools", price: 98500, stockStatus: "In stock at 3 branches", badge: "Best seller", image: cordlessDrillImage, tags: ["drill", "makita", "cordless", "hammer"], rating: 4.9, reviews: 142, description: "High-torque professional drill with two 5Ah batteries and rapid charger.", specs: { Voltage: "18V", Torque: "130 Nm", Chuck: "13 mm", Batteries: "2 x 5Ah" } },
  { id: "bosch-gbh", name: "Bosch 1-1/8 in SDS-Plus Rotary Hammer", sku: "GBH2-28L", category: "Power Tools", department: "Power Tools", price: 76500, stockStatus: "In stock - Kingston", badge: "Trade choice", image: rotaryHammerImage, tags: ["drill", "bosch", "rotary", "hammer"], rating: 4.8, reviews: 97, description: "Low-vibration rotary hammer for drilling and light chiselling in concrete.", specs: { Power: "850W", Impact: "3.2 J", Capacity: "28 mm concrete", Weight: "2.9 kg" } },
  { id: "milwaukee-impact", name: "Milwaukee M18 FUEL Impact Driver", sku: "2953-22", category: "Power Tools", department: "Power Tools", price: 112900, stockStatus: "In stock - Drax Hall", badge: "New", image: impactDriverImage, tags: ["drill", "milwaukee", "impact", "driver"], rating: 4.9, reviews: 188, description: "Compact high-output impact driver with intelligent torque control.", specs: { Voltage: "18V", Torque: "2,000 in-lb", Speed: "3,900 RPM", Batteries: "2 included" } },
  { id: "karcher-hd", name: "Karcher HD 6/15 M Pressure Washer", sku: "KHD615M", category: "Pressure Washers", department: "Cleaning", price: 214000, stockStatus: "In stock - Kingston", badge: "Commercial", image: pressureWasherImage, tags: ["pressure", "washer", "cleaning", "repair"], rating: 4.6, reviews: 63, rentable: true, description: "Commercial cold-water cleaning performance for fleets and facilities.", specs: { Pressure: "2,175 PSI", Flow: "560 L/h", Power: "3.1 kW", Hose: "10 m" } },
  { id: "ingco-compressor", name: "INGCO 100L Belt Drive Air Compressor", sku: "AC1002", category: "Air Compressors", department: "Workshop", price: 168500, stockStatus: "Available for delivery", badge: "Workshop", image: compressorImage, tags: ["air", "compressor", "workshop"], rating: 4.5, reviews: 34, description: "Reliable workshop air supply for pneumatic tools and maintenance.", specs: { Tank: "100 L", Motor: "3 HP", Pressure: "8 bar", Supply: "220V" } },
  { id: "belle-mixer", name: "Belle Minimix 150 Concrete Mixer", sku: "MIX150E", category: "Construction", department: "Construction", price: 189900, stockStatus: "In stock - Kingston", badge: "Rental available", image: concreteMixerImage, tags: ["concrete", "mixer", "construction", "rental"], rating: 4.7, reviews: 44, rentable: true, description: "Portable professional mixer for blockwork, repairs, and small pours.", specs: { Drum: "130 L", Motor: "0.75 HP", Mix: "90 L", Weight: "55 kg" } },
  { id: "toyota-forklift", name: "Toyota 8FGU25 LPG Forklift", sku: "8FGU25-R", category: "Heavy Equipment", department: "Material Handling", price: 4850000, stockStatus: "Commercial enquiry", badge: "Rental fleet", image: forkliftImage, tags: ["forklift", "rental", "heavy", "equipment"], rating: 4.9, reviews: 28, rentable: true, description: "Warehouse-ready pneumatic tyre forklift with dependable Toyota power.", specs: { Capacity: "2,500 kg", Lift: "4.7 m", Fuel: "LPG", Transmission: "Automatic" } },
  { id: "cat-excavator", name: "CAT 303.5 CR Mini Excavator", sku: "CAT3035CR", category: "Heavy Equipment", department: "Earthmoving", price: 8990000, stockStatus: "Rental fleet - 2 available", badge: "Rental only", image: excavatorImage, tags: ["excavator", "rental", "heavy", "equipment"], rating: 4.8, reviews: 22, rentable: true, description: "Compact excavator with strong digging performance for tight jobsites.", specs: { Weight: "3,580 kg", Depth: "3.11 m", Power: "23.6 hp", Width: "1.78 m" } },
  { id: "dewalt-laser", name: "DeWalt 12V 3 x 360 Green Laser Level", sku: "DCLE34031D1", category: "Lighting", department: "Measuring", price: 129900, stockStatus: "In stock online", badge: "Precision", image: laserLevelImage, tags: ["laser", "level", "lighting", "construction"], rating: 4.8, reviews: 76, description: "Bright green beam layout laser for interior fit-out and construction.", specs: { Range: "100 m with detector", Accuracy: "+/- 3 mm at 10 m", Lines: "3 x 360 degree", Battery: "12V" } },
  { id: "lincoln-welder", name: "Lincoln Electric 200A Multi-Process Welder", sku: "POWERTEC200", category: "Welding", department: "Welding", price: 259900, stockStatus: "In stock - Kingston", badge: "Pro series", image: weldingMachineImage, tags: ["welding", "welder", "machine", "fabrication"], rating: 4.7, reviews: 58, description: "MIG, TIG, and stick welding in one portable fabrication machine.", specs: { Output: "200A", Processes: "MIG, TIG, Stick", Input: "120/230V", Duty: "40% at 200A" } },
  { id: "pulsar-1200", name: "Pulsar 1200W Generator", sku: "PG1200S", category: "Generators", subcategory: "Portable Generators", department: "Power Equipment", price: 59900, stockStatus: "Branch availability: Ocho Rios, Kingston, Drax Hall", badge: "Compact power", image: generatorImage, tags: ["generator", "portable", "home", "pulsar"], rating: 4.5, reviews: 48, description: "Compact portable power for lights, fans, and essential household equipment.", specs: { Output: "1,200W", Fuel: "Gasoline", Runtime: "8 hours", Start: "Recoil" } },
  { id: "pulsar-5250", name: "Pulsar 5250W Generator", sku: "PG5250E", category: "Generators", subcategory: "Portable Generators", department: "Power Equipment", price: 179900, stockStatus: "In stock at 3 branches", badge: "Home backup", image: generatorImage, tags: ["generator", "portable", "home", "pulsar"], rating: 4.7, reviews: 73, description: "Dependable home and jobsite backup with electric start.", specs: { Output: "5,250W", Fuel: "Gasoline", Runtime: "10 hours", Start: "Electric" } },
  { id: "ryobi-2300", name: "Ryobi 2300W Inverter Generator", sku: "RYI2300BTA", category: "Generators", subcategory: "Inverter Generators", department: "Power Equipment", price: 149500, stockStatus: "In stock - Ocho Rios", badge: "Quiet inverter", image: generatorImage, tags: ["generator", "inverter", "quiet", "ryobi"], rating: 4.7, reviews: 92, description: "Quiet, clean inverter power for electronics and small appliances.", specs: { Output: "2,300W", Noise: "57 dBA", Runtime: "10.3 hours", Start: "Recoil" } },
  { id: "champion-10kva", name: "Champion 10KVA Generator", sku: "CH10KVA", category: "Generators", subcategory: "Commercial Generators", department: "Power Equipment", price: 389900, stockStatus: "Available - Kingston", badge: "Commercial", image: generatorImage, tags: ["generator", "commercial", "champion", "10kva"], rating: 4.8, reviews: 64, description: "High-output generator for commercial backup and demanding jobsites.", specs: { Output: "10 kVA", Fuel: "Gasoline", Runtime: "9 hours", Start: "Electric" } },
  { id: "ifanite-5kva", name: "Ifanite 5KVA Diesel Generator", sku: "IFD5KVA", category: "Generators", subcategory: "Diesel Generators", department: "Power Equipment", price: 249900, stockStatus: "In stock - Drax Hall", badge: "Diesel value", image: generatorImage, tags: ["generator", "diesel", "ifanite", "5kva"], rating: 4.6, reviews: 39, description: "Fuel-efficient diesel standby power for homes and small businesses.", specs: { Output: "5 kVA", Fuel: "Diesel", Runtime: "12 hours", Start: "Electric" } },
  { id: "ifanite-12kva", name: "Ifanite 12KVA Diesel Generator", sku: "IFD12KVA", category: "Generators", subcategory: "Diesel Generators", department: "Power Equipment", price: 499900, stockStatus: "Commercial stock - Kingston", badge: "Business power", image: generatorImage, tags: ["generator", "diesel", "ifanite", "12kva"], rating: 4.7, reviews: 27, description: "Heavy-duty diesel backup for shops, offices, and commercial sites.", specs: { Output: "12 kVA", Fuel: "Diesel", Runtime: "14 hours", Start: "Electric" } },
  { id: "fixtec-3500", name: "Fixtec 3500W Generator", sku: "FG3500", category: "Generators", subcategory: "Portable Generators", department: "Power Equipment", price: 119900, stockStatus: "In stock - Kingston", badge: "Great value", image: generatorImage, tags: ["generator", "portable", "fixtec", "3500w"], rating: 4.4, reviews: 35, description: "Straightforward portable power for household and trade essentials.", specs: { Output: "3,500W", Fuel: "Gasoline", Runtime: "9 hours", Start: "Recoil" } },
  { id: "sigma-5000", name: "Sigma 5000W Generator", sku: "SG5000E", category: "Generators", subcategory: "Portable Generators", department: "Power Equipment", price: 159900, stockStatus: "In stock - Ocho Rios and Kingston", badge: "Island favorite", image: generatorImage, tags: ["generator", "portable", "sigma", "5000w"], rating: 4.6, reviews: 58, description: "Versatile portable power with electric start and AVR protection.", specs: { Output: "5,000W", Fuel: "Gasoline", Runtime: "10 hours", Start: "Electric" } }
];

const temporaryCategoryFallback = [
  ["Generators", "Reliable standby and site power solutions.", generatorImage, "GN"],
  ["Power Tools", "Cordless and corded tools for every trade.", cordlessDrillImage, "DR"],
  ["Electrical", "Cable, protection, lighting, and test gear.", electricalCategoryImage, "EL"],
  ["Safety", "PPE and site protection for every crew.", safetyCategoryImage, "SH"],
  ["Cleaning", "Commercial cleaning systems and supplies.", cleaningCategoryImage, "CL"],
  ["Welding", "Machines, consumables, and fabrication gear.", weldingMachineImage, "WL"],
  ["Plumbing", "Fittings, pumps, pipe, and repair essentials.", plumbingCategoryImage, "PL"],
  ["Construction", "Concrete, masonry, and jobsite equipment.", concreteMixerImage, "CN"],
  ["Hand Tools", "Professional essentials built for daily work.", handToolsCategoryImage, "HT"],
  ["Outdoor Equipment", "Landscaping and property maintenance.", outdoorCategoryImage, "OE"],
  ["Compressors", "Workshop and portable compressed air systems.", compressorImage, "AC"],
  ["Pressure Washers", "Home, trade, and industrial cleaning power.", pressureWasherImage, "PW"]
] as const;

type ProductDataSnapshot = {
  products: Product[];
  categories: Category[];
};

type ProductDataProviderOptions = ApiClientOptions & {
  context?: PosAdapterContext;
  autoRefresh?: boolean;
};

type ProductRefreshOptions = {
  synchronize?: boolean;
};

const replaceArrayContents = <T>(target: T[], source: T[]) => {
  target.splice(0, target.length, ...source);
};

const emitProductDataChanged = (snapshot: ProductDataSnapshot) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("smartcommerce:products-changed", { detail: snapshot })
  );
};

const mapPlatformProduct = (product: CommerceProduct): Product => ({
  id: product.id,
  name: product.name,
  sku: product.sku || product.id,
  category: product.categoryIds?.[0] || "Uncategorized",
  department: product.categoryIds?.[0] || "Products",
  price:
    product.pricing?.find((price) => price.salePrice !== undefined)?.salePrice ||
    product.pricing?.find((price) => price.listPrice !== undefined)?.listPrice ||
    0,
  stockStatus: "Availability provided by connected system",
  badge: product.rentable ? "Rental available" : "Connected item",
  image: product.images?.[0]?.url || generatorImage,
  tags: product.tags || [],
  rating: 0,
  reviews: 0,
  rentable: product.rentable,
  description: product.description || "",
  specs: Object.fromEntries(
    Object.entries(product.attributes || {}).map(([key, value]) => [
      key,
      String(value ?? ""),
    ])
  ),
});

const mapPlatformCategory = (category: ProductCategory): Category => ({
  name: category.name,
  description: category.description || "",
  image: generatorImage,
  icon: category.name.slice(0, 2).toUpperCase(),
});

const getConfiguredContext = (): PosAdapterContext | undefined => {
  const businessAccountId = import.meta.env.VITE_SMARTCOMMERCE_BUSINESS_ID;
  const providerId = import.meta.env.VITE_SMARTCOMMERCE_PROVIDER_ID;

  if (!businessAccountId || !providerId) return undefined;

  return {
    businessAccountId,
    providerId,
  };
};

const createProductDataProvider = (options: ProductDataProviderOptions = {}) => {
  let snapshot: ProductDataSnapshot = {
    products: temporaryProductFallback,
    categories: temporaryCategoryFallback.map(([name, description, image, icon]) => ({
      name,
      description,
      image,
      icon,
    })),
  };
  let lastSyncResult: PlatformApiResult<PlatformSyncResult> | undefined;
  let refreshPromise: Promise<ProductDataSnapshot> | undefined;
  const listeners = new Set<(snapshot: ProductDataSnapshot) => void>();

  const notify = () => {
    replaceArrayContents(products, snapshot.products);
    replaceArrayContents(categories, snapshot.categories);
    replaceArrayContents(
      departments,
      snapshot.categories.map((category) => category.name)
    );
    emitProductDataChanged(snapshot);
    listeners.forEach((listener) => listener(snapshot));
  };

  return {
    getSnapshot() {
      return snapshot;
    },

    getLastSyncResult() {
      return lastSyncResult;
    },

    subscribe(listener: (snapshot: ProductDataSnapshot) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async sync() {
      const context = options.context || getConfiguredContext();

      if (!context) {
        lastSyncResult = {
          success: false,
          error: {
            code: "PLATFORM_CONTEXT_REQUIRED",
            message:
              "Product synchronization requires a configured business account and provider.",
          },
        };
        return lastSyncResult;
      }

      lastSyncResult = await createProductionSyncClient(options).syncProducts(
        context
      );
      return lastSyncResult;
    },

    async refresh(refreshOptions: ProductRefreshOptions = {}) {
      if (refreshPromise) return refreshPromise;

      refreshPromise = (async () => {
        const context = options.context || getConfiguredContext();

        if (!context) return snapshot;

        if (refreshOptions.synchronize) {
          lastSyncResult = await createProductionSyncClient(options).syncProducts(
            context
          );
        }

        const api = createSmartCommercePlatformApi({
          ...options,
          context,
        });

        const [productResult, categoryResult] = await Promise.all([
          api.searchProducts(),
          api.listCategories(),
        ]);

        const nextProducts =
          productResult.success && productResult.data.items.length
            ? productResult.data.items.map(mapPlatformProduct)
            : snapshot.products;
        const nextCategories =
          categoryResult.success && categoryResult.data.items.length
            ? categoryResult.data.items.map(mapPlatformCategory)
            : snapshot.categories;

        snapshot = {
          products: nextProducts.length ? nextProducts : temporaryProductFallback,
          categories: nextCategories.length
            ? nextCategories
            : temporaryCategoryFallback.map(([name, description, image, icon]) => ({
                name,
                description,
                image,
                icon,
              })),
        };
        notify();
        return snapshot;
      })().finally(() => {
        refreshPromise = undefined;
      });

      return refreshPromise;
    },

    async createProduct(product: CommerceProduct) {
      const context = options.context || getConfiguredContext();

      if (!context) {
        return {
          success: false,
          error: {
            code: "PLATFORM_CONTEXT_REQUIRED",
            message:
              "Product creation requires a configured business account and provider.",
          },
        } as const;
      }

      const result = await createProductionSyncClient(options).createProduct(
        context,
        product
      );

      if (result.success) {
        await this.refresh({ synchronize: true });
      }

      return result;
    },

    async updateProduct(
      productId: string,
      product: Partial<CommerceProduct>
    ) {
      const context = options.context || getConfiguredContext();

      if (!context) {
        return {
          success: false,
          error: {
            code: "PLATFORM_CONTEXT_REQUIRED",
            message:
              "Product updates require a configured business account and provider.",
          },
        } as const;
      }

      const result = await createProductionSyncClient(options).updateProduct(
        context,
        productId,
        product
      );

      if (result.success) {
        await this.refresh({ synchronize: true });
      }

      return result;
    },

    async deleteProduct(productId: string) {
      const context = options.context || getConfiguredContext();

      if (!context) {
        return {
          success: false,
          error: {
            code: "PLATFORM_CONTEXT_REQUIRED",
            message:
              "Product deletion requires a configured business account and provider.",
          },
        } as const;
      }

      const result = await createProductionSyncClient(options).deleteProduct(
        context,
        productId
      );

      if (result.success) {
        await this.refresh({ synchronize: true });
      }

      return result;
    },
  };
};

export const productDataProvider = createProductDataProvider();
export const loadProductsFromPlatform = productDataProvider.refresh;
export const syncProductsWithPlatform = productDataProvider.sync;
export const createProductWithPlatform = productDataProvider.createProduct;
export const updateProductWithPlatform = productDataProvider.updateProduct;
export const deleteProductWithPlatform = productDataProvider.deleteProduct;
export const products: Product[] = productDataProvider.getSnapshot().products;
export const categories: Category[] = productDataProvider.getSnapshot().categories;
export const departments = categories.map((category) => category.name);
export const findProduct = (id: string) => products.find((product) => product.id === id);
export const getProducts = () => productDataProvider.getSnapshot().products;
export const getCategories = () => productDataProvider.getSnapshot().categories;
export const getDepartments = () =>
  productDataProvider.getSnapshot().categories.map((category) => category.name);
export const getProductById = (id: string) =>
  productDataProvider.getSnapshot().products.find((product) => product.id === id);

if (typeof window !== "undefined" && getConfiguredContext()) {
  window.setTimeout(() => {
    void productDataProvider.refresh({ synchronize: true });
  }, 0);
}
