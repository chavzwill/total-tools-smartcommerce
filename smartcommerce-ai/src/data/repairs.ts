import {
  createProductionSyncClient,
  createSmartCommercePlatformApi,
  type ApiClientOptions,
} from "../apiClient";
import type {
  PlatformApiResult,
  PlatformSyncResult,
  PosAdapterContext,
  RepairRequest,
} from "../platform";
import type { RepairType } from "../types";

const temporaryRepairFallback: RepairType[] = [
  {
    id: "repair-drill",
    toolType: "Cordless drill",
    commonIssues: ["Battery not charging", "Chuck stuck", "Trigger fault"],
    startingPrice: 39,
    turnaround: "2 to 4 business days"
  },
  {
    id: "repair-saw",
    toolType: "Circular saw",
    commonIssues: ["Blade wobble", "Motor noise", "Guard jammed"],
    startingPrice: 49,
    turnaround: "3 to 5 business days"
  },
  {
    id: "repair-generator",
    toolType: "Generator",
    commonIssues: ["Will not start", "Low output", "Service required"],
    startingPrice: 79,
    turnaround: "4 to 7 business days"
  }
];

type RepairDataProviderOptions = ApiClientOptions & {
  context?: PosAdapterContext;
  autoRefresh?: boolean;
};

type RepairRefreshOptions = {
  synchronize?: boolean;
};

export type PendingRepairCatalogEndpoint = {
  method: "GET";
  path: "/platform/repairs/catalog";
  status: "pending_implementation";
  returns: "PlatformPage<RepairType>";
};

export const pendingRepairCatalogEndpoint: PendingRepairCatalogEndpoint = {
  method: "GET",
  path: "/platform/repairs/catalog",
  status: "pending_implementation",
  returns: "PlatformPage<RepairType>",
};

const getConfiguredContext = (): PosAdapterContext | undefined => {
  const businessAccountId = import.meta.env.VITE_SMARTCOMMERCE_BUSINESS_ID;
  const providerId = import.meta.env.VITE_SMARTCOMMERCE_PROVIDER_ID;

  if (!businessAccountId || !providerId) return undefined;

  return {
    businessAccountId,
    providerId,
  };
};

const createRepairDataProvider = (options: RepairDataProviderOptions = {}) => {
  let snapshot = temporaryRepairFallback;
  let lastSyncResult: PlatformApiResult<PlatformSyncResult> | undefined;
  let refreshPromise: Promise<RepairType[]> | undefined;
  const listeners = new Set<(snapshot: RepairType[]) => void>();

  const notify = () => {
    replaceArrayContents(repairs, snapshot);
    emitRepairDataChanged(snapshot);
    listeners.forEach((listener) => listener(snapshot));
  };

  return {
    getSnapshot() {
      return snapshot;
    },

    getLastSyncResult() {
      return lastSyncResult;
    },

    subscribe(listener: (snapshot: RepairType[]) => void) {
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
              "Repair synchronization requires a configured business account and provider.",
          },
        };
        return lastSyncResult;
      }

      lastSyncResult = await createProductionSyncClient(options).syncRepairs(
        context
      );
      return lastSyncResult;
    },

    async refresh(refreshOptions: RepairRefreshOptions = {}) {
      if (refreshPromise) return refreshPromise;

      refreshPromise = (async () => {
        const context = options.context || getConfiguredContext();

        if (context && refreshOptions.synchronize) {
          lastSyncResult = await createProductionSyncClient(options).syncRepairs(
            context
          );
        }

        if (context) {
          const catalogResult =
            await createProductionSyncClient(options).listRepairCatalog(context);

          if (catalogResult.success && catalogResult.data.items.length) {
            snapshot = catalogResult.data.items;
          }
        }

        if (!snapshot.length) snapshot = temporaryRepairFallback;
        notify();
        return snapshot;
      })().finally(() => {
        refreshPromise = undefined;
      });

      return refreshPromise;
    },

    async submitRepairRequest(request: Omit<RepairRequest, "businessAccountId">) {
      const context = options.context || getConfiguredContext();

      if (!context) {
        return {
          success: false,
          error: {
            code: "PLATFORM_CONTEXT_REQUIRED",
            message:
              "Repair requests require a configured business account and provider.",
          },
        } as const;
      }

      const api = createSmartCommercePlatformApi({
        ...options,
        context,
      });

      return api.createRepairRequest({
        ...request,
        businessAccountId: context.businessAccountId,
      }).then(async (result) => {
        if (result.success) {
          await this.refresh({ synchronize: true });
        }

        return result;
      });
    },

    async createRepairType(repairType: RepairType) {
      const context = options.context || getConfiguredContext();

      if (!context) {
        return {
          success: false,
          error: {
            code: "PLATFORM_CONTEXT_REQUIRED",
            message:
              "Repair catalog creation requires a configured business account and provider.",
          },
        } as const;
      }

      const result =
        await createProductionSyncClient(options).createRepairCatalogItem(
          context,
          repairType
        );

      if (result.success) {
        await this.refresh({ synchronize: true });
      }

      return result;
    },

    async updateRepairType(repairTypeId: string, repairType: Partial<RepairType>) {
      const context = options.context || getConfiguredContext();

      if (!context) {
        return {
          success: false,
          error: {
            code: "PLATFORM_CONTEXT_REQUIRED",
            message:
              "Repair catalog updates require a configured business account and provider.",
          },
        } as const;
      }

      const result =
        await createProductionSyncClient(options).updateRepairCatalogItem(
          context,
          repairTypeId,
          repairType
        );

      if (result.success) {
        await this.refresh({ synchronize: true });
      }

      return result;
    },

    async deleteRepairType(repairTypeId: string) {
      const context = options.context || getConfiguredContext();

      if (!context) {
        return {
          success: false,
          error: {
            code: "PLATFORM_CONTEXT_REQUIRED",
            message:
              "Repair catalog deletion requires a configured business account and provider.",
          },
        } as const;
      }

      const result =
        await createProductionSyncClient(options).deleteRepairCatalogItem(
          context,
          repairTypeId
        );

      if (result.success) {
        await this.refresh({ synchronize: true });
      }

      return result;
    },
  };
};

const replaceArrayContents = <T>(target: T[], source: T[]) => {
  target.splice(0, target.length, ...source);
};

const emitRepairDataChanged = (snapshot: RepairType[]) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("smartcommerce:repairs-changed", { detail: snapshot })
  );
};

export const repairDataProvider = createRepairDataProvider();
export const loadRepairTypesFromPlatform = repairDataProvider.refresh;
export const syncRepairsWithPlatform = repairDataProvider.sync;
export const submitRepairRequestToPlatform =
  repairDataProvider.submitRepairRequest;
export const createRepairTypeWithPlatform = repairDataProvider.createRepairType;
export const updateRepairTypeWithPlatform = repairDataProvider.updateRepairType;
export const deleteRepairTypeWithPlatform = repairDataProvider.deleteRepairType;
export const repairs: RepairType[] = repairDataProvider.getSnapshot();
export const getRepairTypes = () => repairDataProvider.getSnapshot();

if (typeof window !== "undefined" && getConfiguredContext()) {
  window.setTimeout(() => {
    void repairDataProvider.refresh({ synchronize: true });
  }, 0);
}
