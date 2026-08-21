import fallbackImage from "../assets/generator-optimized.jpg";
import { createApiClient } from "../apiClient";
import type {
  Branch,
  CommerceProduct,
  InventoryAvailability,
  PlatformPage,
  ProductCategory,
  ProductPricing,
} from "../platform";
import type { Category, Product } from "../types";
import type { ShoppingBranch } from "./shoppingBranch";

const api = createApiClient();
const INVENTORY_CONCURRENCY = 8;

export type BranchCatalogueSnapshot = {
  products: Product[];
  categories: Category[];
  branchId?: string;
  branchName?: string;
};

export type BranchCatalogueResult =
  | { success: true; data: BranchCatalogueSnapshot }
  | { success: false; message: string };

function pricingBranchId(price: ProductPricing) {
  const value = price.metadata?.branchId;
  return typeof value === "string" && value ? value : undefined;
}

function providerPrice(product: CommerceProduct, branchId?: string) {
  const pricing = product.pricing || [];
  const branchPrice = branchId ? pricing.find((price) => pricingBranchId(price) === branchId) : undefined;
  const unboundPrice = pricing.find((price) => pricingBranchId(price) === undefined);
  const selected = branchPrice || unboundPrice;
  if (!selected) return undefined;
  const amount = selected.salePrice ?? selected.listPrice;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) return undefined;
  return { amount, currency: selected.currency || "JMD" };
}

function verifiedInventory(record: InventoryAvailability | undefined) {
  return Boolean(record) && record?.metadata?.liveVerified !== false && record?.metadata?.source !== "preview_catalogue";
}

function inventoryRecord(records: InventoryAvailability[] | undefined, branchId?: string) {
  if (!records?.length) return undefined;
  return branchId ? records.find((item) => String(item.branchId || "") === branchId) || records[0] : records[0];
}

function stockText(records: InventoryAvailability[] | undefined, branchId?: string, branchName?: string) {
  if (!branchId || !branchName) return "Choose a branch to confirm live pickup stock";
  const record = inventoryRecord(records, branchId);
  if (!record) return `${branchName}: availability not confirmed`;
  if (!verifiedInventory(record) || record.status === "unknown") return `${branchName}: live stock not verified`;
  const quantity = typeof record.quantityAvailable === "number" && Number.isFinite(record.quantityAvailable)
    ? ` · ${record.quantityAvailable} provider-listed available`
    : "";
  switch (record.status) {
    case "in_stock": return `${branchName}: in stock${quantity}`;
    case "low_stock": return `${branchName}: low stock${quantity}`;
    case "out_of_stock": return `${branchName}: out of stock`;
    case "reserved": return `${branchName}: currently reserved${quantity}`;
    case "backordered": return `${branchName}: backordered`;
    default: return `${branchName}: ${String(record.status).replace(/_/g, " ")}${quantity}`;
  }
}

function purchaseBlockedReason(product: CommerceProduct, records: InventoryAvailability[] | undefined, branchId?: string, branchName?: string) {
  if (product.purchasable === false) return product.rentable ? "Rental only" : "Not available for purchase";
  if (!branchId || !branchName) return undefined;
  const record = inventoryRecord(records, branchId);
  if (!record || !verifiedInventory(record)) return undefined;
  if (record.status === "out_of_stock") return `Out of stock at ${branchName}`;
  if (typeof record.quantityAvailable === "number" && Number.isFinite(record.quantityAvailable) && record.quantityAvailable <= 0) {
    return `No provider-listed stock at ${branchName}`;
  }
  return undefined;
}

function toCategory(category: ProductCategory): Category {
  return {
    name: category.name,
    description: category.description || "",
    image: fallbackImage,
    icon: category.name.slice(0, 2).toUpperCase(),
  };
}

function toProduct(
  product: CommerceProduct,
  categories: Map<string, ProductCategory>,
  records: InventoryAvailability[] | undefined,
  branchId?: string,
  branchName?: string,
): Product {
  const firstCategoryId = product.categoryIds?.[0];
  const categoryName = (firstCategoryId && categories.get(String(firstCategoryId))?.name) || String(firstCategoryId || "Uncategorized");
  const price = providerPrice(product, branchId);
  return {
    id: String(product.id),
    name: product.name,
    sku: product.sku || String(product.id),
    category: categoryName,
    department: categoryName,
    price: price?.amount || 0,
    currency: price?.currency,
    stockStatus: stockText(records, branchId, branchName),
    badge: product.rentable ? "Rental available" : "Connected item",
    image: [...(product.images || [])].sort((a, b) => (a.position || 0) - (b.position || 0))[0]?.url || fallbackImage,
    tags: product.tags || [],
    rating: 0,
    reviews: 0,
    purchasable: product.purchasable,
    purchaseBlockedReason: purchaseBlockedReason(product, records, branchId, branchName),
    rentable: product.rentable,
    description: product.description || "",
    specs: {
      ...(product.brand ? { Brand: product.brand } : {}),
      ...Object.fromEntries(Object.entries(product.attributes || {}).map(([key, value]) => [key, String(value ?? "")])),
    },
  };
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), Math.max(1, items.length)) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function resolveProviderBranch(branch: ShoppingBranch) {
  if (branch === "Online") return { branchId: undefined, branchName: undefined };
  const result = await api.get<Branch[]>("/platform/branches");
  if (!result.success) return undefined;
  const selected = result.data.find((item) => item.active && item.name.trim().toLowerCase() === branch.toLowerCase());
  return selected ? { branchId: String(selected.id), branchName: selected.name } : undefined;
}

export async function loadBranchCatalogue(branch: ShoppingBranch): Promise<BranchCatalogueResult> {
  const resolved = await resolveProviderBranch(branch);
  if (branch !== "Online" && !resolved) {
    return { success: false, message: `${branch} could not be resolved against the connected provider branches.` };
  }

  const branchId = resolved?.branchId;
  const branchName = resolved?.branchName;
  const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
  const [productResult, categoryResult] = await Promise.all([
    api.get<PlatformPage<CommerceProduct>>(`/platform/products${query}`),
    api.get<PlatformPage<ProductCategory>>("/platform/categories"),
  ]);

  if (!productResult.success) {
    return { success: false, message: productResult.error.message || "The connected provider catalogue could not be loaded." };
  }

  const categoryItems = categoryResult.success ? categoryResult.data.items : [];
  const categoryMap = new Map(categoryItems.map((category) => [String(category.id), category]));
  const inventory = branchId
    ? await mapWithConcurrency(productResult.data.items, INVENTORY_CONCURRENCY, async (product) => {
        const result = await api.get<InventoryAvailability[]>(
          `/platform/inventory/availability?productId=${encodeURIComponent(String(product.id))}&branchId=${encodeURIComponent(branchId)}&quantity=1`,
        );
        return result.success ? result.data : undefined;
      })
    : productResult.data.items.map(() => undefined);

  return {
    success: true,
    data: {
      products: productResult.data.items.map((product, index) => toProduct(product, categoryMap, inventory[index], branchId, branchName)),
      categories: categoryItems.map(toCategory),
      branchId,
      branchName,
    },
  };
}
