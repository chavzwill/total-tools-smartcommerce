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
  createProductionSyncClient,
  createSmartCommercePlatformApi,
  type ApiClientOptions,
} from "../apiClient";
import type {
  PlatformApiResult,
  PlatformSyncResult,
  PosAdapterContext,
  RentalAsset,
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

const mapPlatformRentalAsset = (asset: RentalAsset): RentalItem => ({
  id: asset.id,
  name: asset.name || asset.assetTag || asset.productId || asset.id,
  category: String(asset.attributes?.category || "Rental Equipment"),
  dailyRate: asset.ratePlans?.[0]?.dailyRate || 0,
  weeklyRate: asset.ratePlans?.[0]?.weeklyRate || 0,
  monthlyRate: asset.ratePlans?.[0]?.monthlyRate || 0,
  availability: asset.status,
  branchAvailability: asset.branchId
    ? `Branch availability: ${asset.branchId}`
    : "Availability provided by connected system",
  image: rentalImage,
  description: String(
    asset.attributes?.description ||
      "Rental asset provided by the connected equipment system."
  ),
  specs: Object.fromEntries(
    Object.entries(asset.attributes || {}).map(([key, value]) => [
      key,
      String(value ?? ""),
    ])
  ),
});

const createRentalDataProvider = (options: RentalDataProviderOptions = {}) => {
  const configuredContext = options.context || getConfiguredContext();
  let snapshot = configuredContext ? [] : temporaryRentalFallback;
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
        const context = options.context || getConfiguredContext();

        if (!context) return snapshot;

        if (refreshOptions.synchronize) {
          lastSyncResult = await createProductionSyncClient(options).syncRentals(
            context
          );
        }

        const api = createSmartCommercePlatformApi({
          ...options,
          context,
        });

        const result = await api.listRentalAssets();

        if (result.success) {
          snapshot = result.data.items.map(mapPlatformRentalAsset);
        } else {
          snapshot = [];
        }

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

if (typeof window !== "undefined" && getConfiguredContext()) {
  window.setTimeout(() => {
    void rentalDataProvider.refresh({ synchronize: true });
  }, 0);
}
