import type { CommerceProduct, InventoryAvailability, PlatformApiResult, PlatformEntityId } from "../platform/contracts";
import type { InventoryAvailabilityQuery, PosAdapter, PosAdapterContext, ProductSearchQuery } from "../platform/posAdapter";

function inactiveProductError(requestId?: string): PlatformApiResult<never> {
  return {
    success: false,
    error: {
      code: "PRODUCT_INACTIVE",
      message: "This product is no longer active for commerce.",
      retryable: false,
    },
    requestId,
  };
}

/**
 * Commerce safety wrapper for provider adapters whose catalog endpoints may
 * return inactive rows unless explicitly filtered. The underlying provider is
 * still allowed to expose inactive products to staff diagnostics through
 * ProductSearchQuery.includeInactive=true, but customer-facing reads default
 * to active products only.
 */
export function withActiveCatalogGuard(adapter: PosAdapter): PosAdapter {
  return {
    ...adapter,

    async searchProducts(context: PosAdapterContext, query?: ProductSearchQuery) {
      const result = await adapter.searchProducts(context, query);
      if (!result.success || query?.includeInactive) return result;
      const items = result.data.items.filter((product) => product.active !== false);
      return {
        ...result,
        data: {
          ...result.data,
          items,
          // Do not claim the provider total is an active-only total when the
          // upstream endpoint returned inactive rows too.
          total: result.data.hasNextPage ? undefined : items.length,
        },
      };
    },

    async getProductById(context: PosAdapterContext, productId: PlatformEntityId): Promise<PlatformApiResult<CommerceProduct>> {
      const result = await adapter.getProductById(context, productId);
      if (!result.success) return result;
      return result.data.active === false
        ? inactiveProductError(context.requestId)
        : result;
    },

    async getInventoryAvailability(
      context: PosAdapterContext,
      query: InventoryAvailabilityQuery,
    ): Promise<PlatformApiResult<InventoryAvailability[]>> {
      // Availability must not make a retired/inactive product purchasable just
      // because the provider still has quantity on hand.
      const product = await adapter.getProductById(context, query.productId);
      if (!product.success) return product as PlatformApiResult<InventoryAvailability[]>;
      if (product.data.active === false) {
        return inactiveProductError(context.requestId) as PlatformApiResult<InventoryAvailability[]>;
      }
      return adapter.getInventoryAvailability(context, query);
    },
  };
}
