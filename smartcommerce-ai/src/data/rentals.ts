import rentalImage from "../assets/services/equipment-rentals.jpg";
import generatorImage from "../assets/generator-optimized.jpg";
import excavatorImage from "../assets/products/mini-excavator.jpg";
import forkliftImage from "../assets/products/forklift.jpg";
import concreteMixerImage from "../assets/products/concrete-mixer.jpg";
import backhoeImage from "../assets/rentals/backhoe.jpg";
import boomLiftImage from "../assets/rentals/boom-lift.jpg";
import scissorLiftImage from "../assets/rentals/scissor-lift.jpg";
import telehandlerImage from "../assets/rentals/telehandler.jpg";
import rollerImage from "../assets/rentals/road-roller.jpg";
import skidSteerImage from "../assets/rentals/skid-steer.jpg";
import lightingTowerImage from "../assets/rentals/lighting-tower.jpg";
import waterPumpImage from "../assets/rentals/water-pump.jpg";
import {
  createApiClient,
  createProductionSyncClient,
  createSmartCommercePlatformApi,
  type ApiClientOptions,
} from "../apiClient";
import { getCommerceDataMode } from "./providerMode";
import {
  getPhysicalShoppingBranch,
  SHOPPING_BRANCH_CHANGED_EVENT,
} from "../lib/shoppingBranch";
import type {
  Branch,
  CommerceProduct,
  PlatformApiResult,
  PlatformPage,
  PlatformSyncResult,
  PosAdapterContext,
  RentalAsset,
  RentalRatePlan,
  RentalReservationRequest,
} from "../platform";
import type { RentalItem } from "../types";

const temporaryRentalEquipmentFallback = [
  ["excavator", "CAT 320 Excavator", "Earthmoving", 95000, "Available tomorrow", "22,000 kg", "7.2 m"],
  ["backhoe", "JCB 3CX Backhoe Loader", "Earthmoving", 78000, "Available June 24", "8,070 kg", "5.5 m"],
  ["forklift", "Toyota 2.5T Forklift", "Material Handling", 42000, "3 units available", "2,500 kg", "4.7 m"],
  ["boom-lift", "JLG 45ft Boom Lift", "Access", 52000, "Available today", "230 kg basket", "13.7 m"],
  ["scissor-lift", "Genie 26ft Scissor Lift", "Access", 34000, "2 units available", "454 kg basket", "9.9 m"],
  ["telehandler", "JCB 540-170 Telehandler", "Material Handling", 69000, "Available June 25", "4,000 kg", "17 m"],
  ["roller", "Bomag 5T Smooth Drum Roller", "Compaction", 61000, "Available this week", "5,000 kg", "1.68 m drum"],
  ["skid-steer", "Bobcat S650 Skid Steer", "Earthmoving", 49000, "Available tomorrow", "1,220 kg", "3.1 m"],
  ["concrete-mixer", "Belle 150L Concrete Mixer", "Concrete", 8500, "8 units available", "90 L mix", "Electric"],
  ["lighting-tower", "Atlas Copco LED Lighting Tower", "Site Services", 18000, "Available today", "4 x 350W LED", "8 m mast"],
  ["site-generator", "60 kVA Silent Site Generator", "Power", 26000, "Available today", "60 kVA", "Diesel"],
  ["water-pump", "3 in Diesel Trash Water Pump", "Pumps", 12000, "5 units available", "1,200 L/min", "7 m suction"]
] as const;

const rentalImages: Record<string, string> = {
  excavator: excavatorImage,
  backhoe: backhoeImage,
  forklift: forkliftImage,
  "boom-lift": boomLiftImage,
  "scissor-lift": scissorLiftImage,
  telehandler: telehandlerImage,
  roller: rollerImage,
  "skid-steer": skidSteerImage,
  "concrete-mixer": concreteMixerImage,
  "lighting-tower": lightingTowerImage,
  "site-generator": generatorImage,
  "water-pump": waterPumpImage
};

type RentalDataProviderOptions = ApiClientOptions & {
  context?: PosAdapterContext;
  autoRefresh?: boolean;
};

type RentalRefreshOptions = {
  synchronize?: boolean;
};

const replaceArrayContents = <T>(target: T[], source: T[]) => {
  target.splice(0, target.length, ...source);
};

const emitRentalDataChanged = (snapshot: RentalItem[]) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("smartcommerce:rentals-changed", { detail: snapshot })
  );
};

const temporaryRentalFallback: RentalItem[] = temporaryRentalEquipmentFallback.map(([id, name, category, dailyRate, availability, capacity, reach]) => ({
  id, name, category, dailyRate, weeklyRate: dailyRate * 5, monthlyRate: dailyRate * 16,
  currency: "JMD",
  availability, branchAvailability: "Branch availability: Ocho Rios, Kingston, Drax Hall",
  image: rentalImages[id] || rentalImage,
  description: `Commercial-grade ${name.toLowerCase()} maintained by Total Tools Jamaica and ready for islandwide delivery.`,
  specs: { Capacity: capacity, "Reach / power": reach, Delivery: "Islandwide", Support: "24/7 fleet support" }
}));

const getConfiguredContext = (): PosAdapterContext | undefined => {
  const businessAccountId = import.meta.env.VITE_SMARTCOMMERCE_BUSINESS_ID;
  const providerId = import.meta.env.VITE_SMARTCOMMERCE_PROVIDER_ID;

  if (!businessAccountId || !providerId) return undefined;

  return {
    businessAccountId,
    providerId,
  };
};

const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
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
};

const ratePlanScore = (plan: RentalRatePlan) =>
  [plan.dailyRate, plan.weeklyRate, plan.monthlyRate]
    .filter((value) => typeof value === "number" && Number.isFinite(value) && value >= 0)
    .length;

const selectComparableRatePlan = (asset: RentalAsset) => {
  const validPlans = (asset.ratePlans || []).filter((plan) => ratePlanScore(plan) > 0);
  const currencies = new Set(validPlans.map((plan) => String(plan.currency || "").trim().toUpperCase()).filter(Boolean));
  if (currencies.size !== 1) return undefined;
  return [...validPlans].sort((a, b) => ratePlanScore(b) - ratePlanScore(a))[0];
};

const providerAvailabilityLabel = (asset: RentalAsset) => {
  if (asset.metadata?.liveVerified === false || asset.metadata?.source === "preview_catalogue") {
    return "Live availability not verified";
  }
  switch (asset.status) {
    case "available": return "Available now";
    case "reserved": return "Currently reserved";
    case "rented": return "Currently rented";
    case "maintenance": return "Maintenance";
    case "retired": return "Retired";
    case "unavailable": return "Unavailable";
    case "unknown": return "Check availability";
    default: return `Provider status: ${String(asset.status).replace(/_/g, " ")}`;
  }
};

const mapPlatformRentalAsset = (
  asset: RentalAsset,
  product?: CommerceProduct,
  branchName?: string,
): RentalItem => {
  const ratePlan = selectComparableRatePlan(asset);
  const assetAttributes = Object.fromEntries(
    Object.entries(asset.attributes || {}).map(([key, value]) => [key, String(value ?? "")]),
  );
  const productAttributes = Object.fromEntries(
    Object.entries(product?.attributes || {}).map(([key, value]) => [key, String(value ?? "")]),
  );
  const productImage = [...(product?.images || [])]
    .sort((a, b) => (a.position || 0) - (b.position || 0))[0]?.url;
  const category = String(
    asset.attributes?.category ||
    product?.attributes?.Category ||
    product?.categoryIds?.[0] ||
    "Rental Equipment"
  );

  return {
    id: String(asset.id),
    name: asset.name || product?.name || asset.assetTag || asset.productId || String(asset.id),
    category,
    dailyRate: typeof ratePlan?.dailyRate === "number" ? ratePlan.dailyRate : 0,
    weeklyRate: typeof ratePlan?.weeklyRate === "number" ? ratePlan.weeklyRate : 0,
    monthlyRate: typeof ratePlan?.monthlyRate === "number" ? ratePlan.monthlyRate : 0,
    currency: ratePlan?.currency ? String(ratePlan.currency).toUpperCase() : undefined,
    availability: providerAvailabilityLabel(asset),
    branchAvailability: branchName
      ? `Branch availability: ${branchName}`
      : asset.branchId
        ? `Provider branch: ${asset.branchId}`
        : "Branch availability requires provider confirmation",
    image: productImage || rentalImages[String(asset.id)] || rentalImage,
    description: String(
      product?.description ||
      asset.attributes?.description ||
      "Rental asset provided by the connected equipment system."
    ),
    specs: {
      ...productAttributes,
      ...assetAttributes,
    },
  };
};

const createRentalDataProvider = (options: RentalDataProviderOptions = {}) => {
  const connected = getCommerceDataMode() === "connected";
  let snapshot = connected ? [] : temporaryRentalFallback;
  let lastSyncResult: PlatformApiResult<PlatformSyncResult> | undefined;
  let refreshPromise: Promise<RentalItem[]> | undefined;
  const listeners = new Set<(snapshot: RentalItem[]) => void>();

  const notify = () => {
    replaceArrayContents(rentals, snapshot);
    emitRentalDataChanged(snapshot);
    listeners.forEach((listener) => listener(snapshot));
  };

  return {
    getSnapshot() {
      return snapshot;
    },

    getLastSyncResult() {
      return lastSyncResult;
    },

    subscribe(listener: (snapshot: RentalItem[]) => void) {
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
              "Rental synchronization requires a configured business account and provider.",
          },
        };
        return lastSyncResult;
      }

      lastSyncResult = await createProductionSyncClient(options).syncRentals(
        context
      );
      return lastSyncResult;
    },

    async refresh(refreshOptions: RentalRefreshOptions = {}) {
      if (refreshPromise) return refreshPromise;

      refreshPromise = (async () => {
        if (!connected) return snapshot;

        const context = options.context || getConfiguredContext();
        if (refreshOptions.synchronize && context) {
          lastSyncResult = await createProductionSyncClient(options).syncRentals(context);
        }

        const client = createApiClient(options);
        const selectedBranch = getPhysicalShoppingBranch();
        let branchId: string | undefined;
        let branchName: string | undefined;
        let branches: Branch[] = [];

        const branchResult = await client.get<Branch[]>("/platform/branches");
        if (branchResult.success) branches = branchResult.data.filter((branch) => branch.active);

        if (selectedBranch) {
          if (!branchResult.success) {
            snapshot = [];
            notify();
            return snapshot;
          }
          const resolved = branches.find(
            (branch) => branch.name.trim().toLowerCase() === selectedBranch.toLowerCase(),
          );
          if (!resolved) {
            snapshot = [];
            notify();
            return snapshot;
          }
          branchId = String(resolved.id);
          branchName = resolved.name;
        }

        const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
        const result = await client.get<PlatformPage<RentalAsset>>(`/platform/rentals${query}`);
        if (!result.success) {
          snapshot = [];
          notify();
          return snapshot;
        }

        const assets = branchId
          ? result.data.items.filter((asset) => String(asset.branchId || "") === branchId)
          : result.data.items;
        const productIds = Array.from(new Set(
          assets.map((asset) => asset.productId ? String(asset.productId) : "").filter(Boolean),
        ));
        const productEntries = await mapWithConcurrency(productIds, 8, async (productId) => {
          const productResult = await client.get<CommerceProduct>(`/platform/products/${encodeURIComponent(productId)}`);
          return [productId, productResult.success ? productResult.data : undefined] as const;
        });
        const products = new Map(productEntries);
        const branchNames = new Map(branches.map((branch) => [String(branch.id), branch.name]));

        snapshot = assets.map((asset) => mapPlatformRentalAsset(
          asset,
          asset.productId ? products.get(String(asset.productId)) : undefined,
          branchName || (asset.branchId ? branchNames.get(String(asset.branchId)) : undefined),
        ));
        notify();
        return snapshot;
      })().finally(() => {
        refreshPromise = undefined;
      });

      return refreshPromise;
    },

    async createReservation(
      request: Omit<RentalReservationRequest, "businessAccountId">
    ) {
      const context = options.context || getConfiguredContext();

      if (!context) {
        return {
          success: false,
          error: {
            code: "PLATFORM_CONTEXT_REQUIRED",
            message:
              "Rental reservations require a configured business account and provider.",
          },
        } as const;
      }

      const api = createSmartCommercePlatformApi({
        ...options,
        context,
      });
      const result = await api.createRentalReservation({
        ...request,
        businessAccountId: context.businessAccountId,
      });

      if (result.success) {
        await this.refresh({ synchronize: true });
      }

      return result;
    },

    async createRentalAsset(rentalAsset: RentalAsset) {
      const context = options.context || getConfiguredContext();

      if (!context) {
        return {
          success: false,
          error: {
            code: "PLATFORM_CONTEXT_REQUIRED",
            message:
              "Rental asset creation requires a configured business account and provider.",
          },
        } as const;
      }

      const result = await createProductionSyncClient(options).createRentalAsset(
        context,
        rentalAsset
      );

      if (result.success) {
        await this.refresh({ synchronize: true });
      }

      return result;
    },

    async updateRentalAsset(
      rentalAssetId: string,
      rentalAsset: Partial<RentalAsset>
    ) {
      const context = options.context || getConfiguredContext();

      if (!context) {
        return {
          success: false,
          error: {
            code: "PLATFORM_CONTEXT_REQUIRED",
            message:
              "Rental asset updates require a configured business account and provider.",
          },
        } as const;
      }

      const result = await createProductionSyncClient(options).updateRentalAsset(
        context,
        rentalAssetId,
        rentalAsset
      );

      if (result.success) {
        await this.refresh({ synchronize: true });
      }

      return result;
    },

    async deleteRentalAsset(rentalAssetId: string) {
      const context = options.context || getConfiguredContext();

      if (!context) {
        return {
          success: false,
          error: {
            code: "PLATFORM_CONTEXT_REQUIRED",
            message:
              "Rental asset deletion requires a configured business account and provider.",
          },
        } as const;
      }

      const result = await createProductionSyncClient(options).deleteRentalAsset(
        context,
        rentalAssetId
      );

      if (result.success) {
        await this.refresh({ synchronize: true });
      }

      return result;
    },
  };
};

export const rentalDataProvider = createRentalDataProvider();
export const loadRentalsFromPlatform = rentalDataProvider.refresh;
export const syncRentalsWithPlatform = rentalDataProvider.sync;
export const createRentalReservationWithPlatform =
  rentalDataProvider.createReservation;
export const createRentalAssetWithPlatform = rentalDataProvider.createRentalAsset;
export const updateRentalAssetWithPlatform = rentalDataProvider.updateRentalAsset;
export const deleteRentalAssetWithPlatform = rentalDataProvider.deleteRentalAsset;
export const rentals: RentalItem[] = rentalDataProvider.getSnapshot();
export const findRental = (id: string) => rentals.find((rental) => rental.id === id);
export const getRentals = () => rentalDataProvider.getSnapshot();
export const getRentalById = (id: string) =>
  rentalDataProvider.getSnapshot().find((rental) => rental.id === id);

if (typeof window !== "undefined" && getCommerceDataMode() === "connected") {
  window.setTimeout(() => {
    void rentalDataProvider.refresh();
  }, 0);
  window.addEventListener(SHOPPING_BRANCH_CHANGED_EVENT, () => {
    void rentalDataProvider.refresh();
  });
}
