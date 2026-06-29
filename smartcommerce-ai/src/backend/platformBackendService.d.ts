import type { CommerceProduct, PlatformApiResult, PlatformInvoice, RentalAsset } from "../platform";
import type { RepairType } from "../types";
import type { PlatformBackendRuntime, PlatformBackendService } from "./platformBackendTypes";
export declare function createPlatformBackendService(runtime: PlatformBackendRuntime): PlatformBackendService;
export declare const pendingProductMutation: () => PlatformApiResult<CommerceProduct>;
export declare const pendingRentalAssetMutation: () => PlatformApiResult<RentalAsset>;
export declare const pendingRepairCatalogMutation: () => PlatformApiResult<RepairType>;
export declare const pendingInvoiceLookup: () => PlatformApiResult<PlatformInvoice>;
