import type {
  CommerceProduct,
  CustomerAccount,
  PlatformApiResult,
  PlatformEntityId,
  PlatformInvoice,
  PlatformMetadata,
  PlatformOrder,
  PlatformPage,
  PlatformSyncResult,
  PlatformWebhookEvent,
  RentalAsset,
  RepairJob,
} from "../platform";
import type {
  ProductSearchQuery,
  RentalAssetQuery,
  RentalAvailabilityQuery,
} from "../platform";
import type { RepairType } from "../types";
import type {
  AssistantRequest,
  AssistantResult,
  CheckoutRequest,
  CheckoutResult,
  PlatformBackendRuntime,
  PlatformBackendService,
} from "./platformBackendTypes";

const emptyPage = <T>(): PlatformPage<T> => ({
  items: [],
  hasNextPage: false,
  total: 0,
  page: 1,
  pageSize: 0,
});

const unsupported = <T>(
  operation: string,
  capability: string
): PlatformApiResult<T> => ({
  success: false,
  error: {
    code: "POS_ADAPTER_CAPABILITY_UNSUPPORTED",
    message: `${operation} is not available for the active provider adapter.`,
    details: { capability },
  },
});

const requestIdFrom = (request: Request) =>
  request.headers.get("x-request-id") ||
  `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const withRequestMetadata = (
  metadata: PlatformMetadata | undefined,
  requestId: string
): PlatformMetadata => ({
  ...(metadata || {}),
  requestId,
  source: "smartcommerce-platform-backend",
});

export function createPlatformBackendService(
  runtime: PlatformBackendRuntime
): PlatformBackendService {
  const getContext = async (request: Request) => {
    const context = await runtime.resolveContext(request);
    return {
      ...context,
      requestId: context.requestId || requestIdFrom(request),
    };
  };

  const requestSync = async (
    request: Request,
    scope: "products" | "rentals" | "repairs"
  ): Promise<PlatformApiResult<PlatformSyncResult>> => {
    const context = await getContext(request);

    return runtime.adapter.handleWebhook(context, {
      providerId: context.providerId,
      businessAccountId: context.businessAccountId,
      eventType: `platform.sync.${scope}.requested`,
      payload: { scope },
      metadata: withRequestMetadata(undefined, context.requestId || requestIdFrom(request)),
    });
  };

  return {
    async healthCheck(request) {
      const context = await getContext(request);
      return runtime.adapter.healthCheck(context);
    },

    async listBranches(request) {
      const context = await getContext(request);
      return runtime.adapter.listBranches(context);
    },

    async listCategories(request) {
      const context = await getContext(request);
      return runtime.adapter.listCategories(context);
    },

    async getInventoryAvailability(request, query) {
      const context = await getContext(request);
      return runtime.adapter.getInventoryAvailability(context, query);
    },

    syncProducts(request) {
      return requestSync(request, "products");
    },

    syncRentals(request) {
      return requestSync(request, "rentals");
    },

    syncRepairs(request) {
      return requestSync(request, "repairs");
    },

    async searchProducts(request, query?: ProductSearchQuery) {
      const context = await getContext(request);
      return runtime.adapter.searchProducts(context, query);
    },

    async getProductById(request, productId: PlatformEntityId) {
      const context = await getContext(request);
      return runtime.adapter.getProductById(context, productId);
    },

    async createProduct(request, input: CommerceProduct) {
      const context = await getContext(request);
      if (!runtime.adapter.createProduct) {
        return unsupported<CommerceProduct>("Product creation", "products");
      }

      return runtime.adapter.createProduct(context, {
        ...input,
        metadata: withRequestMetadata(input.metadata, context.requestId || requestIdFrom(request)),
      });
    },

    async updateProduct(request, productId, input) {
      const context = await getContext(request);
      if (!runtime.adapter.updateProduct) {
        return unsupported<CommerceProduct>("Product update", "products");
      }

      return runtime.adapter.updateProduct(context, productId, {
        ...input,
        metadata: withRequestMetadata(input.metadata, context.requestId || requestIdFrom(request)),
      });
    },

    async deleteProduct(request, productId) {
      const context = await getContext(request);
      if (!runtime.adapter.deleteProduct) {
        return unsupported<{ id: PlatformEntityId }>("Product deletion", "products");
      }

      return runtime.adapter.deleteProduct(context, productId);
    },

    async listRentalAssets(request, query?: RentalAssetQuery) {
      const context = await getContext(request);
      return runtime.adapter.listRentalAssets(context, query);
    },

    async getRentalAssetById(request, rentalAssetId: PlatformEntityId) {
      const context = await getContext(request);
      return runtime.adapter.getRentalAssetById(context, rentalAssetId);
    },

    async createRentalAsset(request, input) {
      const context = await getContext(request);
      if (!runtime.adapter.createRentalAsset) {
        return unsupported<RentalAsset>("Rental asset creation", "rentals");
      }

      return runtime.adapter.createRentalAsset(context, {
        ...input,
        metadata: withRequestMetadata(input.metadata, context.requestId || requestIdFrom(request)),
      });
    },

    async updateRentalAsset(request, rentalAssetId, input) {
      const context = await getContext(request);
      if (!runtime.adapter.updateRentalAsset) {
        return unsupported<RentalAsset>("Rental asset update", "rentals");
      }

      return runtime.adapter.updateRentalAsset(context, rentalAssetId, {
        ...input,
        metadata: withRequestMetadata(input.metadata, context.requestId || requestIdFrom(request)),
      });
    },

    async deleteRentalAsset(request, rentalAssetId) {
      const context = await getContext(request);
      if (!runtime.adapter.deleteRentalAsset) {
        return unsupported<{ id: PlatformEntityId }>(
          "Rental asset deletion",
          "rentals"
        );
      }

      return runtime.adapter.deleteRentalAsset(context, rentalAssetId);
    },

    async getRentalAvailability(request, query: RentalAvailabilityQuery) {
      const context = await getContext(request);
      return runtime.adapter.getRentalAvailability(context, query);
    },

    async createRentalReservation(request, input) {
      const context = await getContext(request);
      const requestId = context.requestId || requestIdFrom(request);
      const { verification: _untrustedClientVerification, ...reservationInput } = input;

      let providerVerification;
      if (runtime.adapter.verifyRental) {
        const verificationResult = await runtime.adapter.verifyRental(context, {
          rentalAssetId: reservationInput.rentalAssetId,
          productId: reservationInput.productId,
          branchId: reservationInput.branchId,
          customerAccountId: reservationInput.customerAccountId,
          startDate: reservationInput.startDate,
          endDate: reservationInput.endDate,
          quantity: reservationInput.quantity,
          requireIdentityVerification: true,
          requireAccountStanding: true,
          requireCertificationCheck: true,
          requireInsuranceCheck: true,
          metadata: withRequestMetadata(reservationInput.metadata, requestId),
        });

        if (!verificationResult.success) return verificationResult;
        providerVerification = verificationResult.data;

        if (providerVerification.decision === "rejected") {
          return {
            success: false,
            error: {
              code: "RENTAL_VERIFICATION_REJECTED",
              message: "The connected rental provider did not approve this reservation request.",
              details: {
                reasons: providerVerification.reasons || [],
                outstandingRequirements: providerVerification.outstandingRequirements || [],
              },
              retryable: false,
            },
            requestId,
          };
        }
      }

      return runtime.adapter.createRentalReservation(context, {
        ...reservationInput,
        ...(providerVerification ? { verification: providerVerification } : {}),
        metadata: {
          ...withRequestMetadata(reservationInput.metadata, requestId),
          rentalVerificationSource: providerVerification ? "provider_native" : "not_available",
        },
      });
    },

    async listRepairCatalog(request) {
      const context = await getContext(request);
      if (!runtime.adapter.listRepairCatalog) {
        return {
          success: true,
          data: emptyPage<RepairType>(),
        };
      }

      return runtime.adapter.listRepairCatalog(context);
    },

    async createRepairCatalogItem(request, input) {
      const context = await getContext(request);
      if (!runtime.adapter.createRepairCatalogItem) {
        return unsupported<RepairType>("Repair catalog creation", "repairs");
      }

      return runtime.adapter.createRepairCatalogItem(context, input);
    },

    async updateRepairCatalogItem(request, repairTypeId, input) {
      const context = await getContext(request);
      if (!runtime.adapter.updateRepairCatalogItem) {
        return unsupported<RepairType>("Repair catalog update", "repairs");
      }

      return runtime.adapter.updateRepairCatalogItem(context, repairTypeId, input);
    },

    async deleteRepairCatalogItem(request, repairTypeId) {
      const context = await getContext(request);
      if (!runtime.adapter.deleteRepairCatalogItem) {
        return unsupported<{ id: PlatformEntityId }>(
          "Repair catalog deletion",
          "repairs"
        );
      }

      return runtime.adapter.deleteRepairCatalogItem(context, repairTypeId);
    },

    async createRepairRequest(request, input) {
      const context = await getContext(request);
      return runtime.adapter.createRepairRequest(context, {
        ...input,
        metadata: withRequestMetadata(input.metadata, context.requestId || requestIdFrom(request)),
      });
    },

    async getRepairJobById(request, repairJobId: PlatformEntityId) {
      const context = await getContext(request);
      return runtime.adapter.getRepairJobById(context, repairJobId);
    },

    async createCommercialQuote(request, input) {
      const context = await getContext(request);
      return runtime.adapter.createCommercialQuote(context, {
        ...input,
        metadata: withRequestMetadata(input.metadata, context.requestId || requestIdFrom(request)),
      });
    },

    async createCustomer(request, input) {
      const context = await getContext(request);
      return runtime.adapter.createCustomer(context, {
        ...input,
        metadata: withRequestMetadata(input.metadata, context.requestId || requestIdFrom(request)),
      });
    },

    async getCustomerById(request, customerId) {
      const context = await getContext(request);
      return runtime.adapter.getCustomerById(context, customerId);
    },

    async createOrder(request, input) {
      const context = await getContext(request);
      return runtime.adapter.createOrder(context, {
        ...input,
        metadata: withRequestMetadata(input.metadata, context.requestId || requestIdFrom(request)),
      });
    },

    async getOrderById(request, orderId) {
      const context = await getContext(request);
      return runtime.adapter.getOrderById(context, orderId);
    },

    async createInvoice(request, input) {
      const context = await getContext(request);
      return runtime.adapter.createInvoice(context, {
        ...input,
        metadata: withRequestMetadata(input.metadata, context.requestId || requestIdFrom(request)),
      });
    },

    async getInvoiceById(request, invoiceId) {
      const context = await getContext(request);
      if (!runtime.adapter.getInvoiceById) {
        return unsupported<PlatformInvoice>("Invoice lookup", "invoices");
      }

      return runtime.adapter.getInvoiceById(context, invoiceId);
    },

    async runAssistant(request, input: AssistantRequest) {
      const context = await getContext(request);
      const [products, rentals] = await Promise.all([
        runtime.adapter.searchProducts(context, {
          search: input.prompt,
          branchId: input.branchId,
          pageSize: 5,
        }),
        runtime.adapter.listRentalAssets(context, {
          branchId: input.branchId,
          pageSize: 5,
        }),
      ]);

      if (!products.success) return products as PlatformApiResult<AssistantResult>;
      if (!rentals.success) return rentals as PlatformApiResult<AssistantResult>;

      const hasRecommendations =
        products.data.items.length > 0 || rentals.data.items.length > 0;

      return {
        success: true,
        data: {
          response: hasRecommendations
            ? "The assistant matched the request against connected catalog and rental availability."
            : "The connected provider does not have enough product or rental data for this request yet.",
          recommendedProducts: products.data.items,
          recommendedRentals: rentals.data.items,
          nextActions: hasRecommendations
            ? ["review_recommendations", "check_availability", "submit_request"]
            : ["refine_prompt", "sync_provider_data", "retry_request"],
        },
      };
    },

    async checkout(request, input: CheckoutRequest) {
      const context = await getContext(request);

      const customer =
        input.customer &&
        (await runtime.adapter.createCustomer(context, {
          ...input.customer,
          metadata: withRequestMetadata(
            input.customer.metadata,
            context.requestId || requestIdFrom(request)
          ),
        }));

      if (customer && !customer.success) return customer;

      const orderPayload: PlatformOrder = {
        ...input.order,
        customerAccountId:
          input.order.customerAccountId ||
          (customer && customer.success ? customer.data.id : undefined),
        metadata: withRequestMetadata(
          input.order.metadata,
          context.requestId || requestIdFrom(request)
        ),
      };
      const order = await runtime.adapter.createOrder(context, orderPayload);

      if (!order.success) return order;

      if (!input.invoice) {
        return {
          success: true,
          data: { order: order.data },
        };
      }

      const invoice = await runtime.adapter.createInvoice(context, {
        ...input.invoice,
        orderId: input.invoice.orderId || order.data.id,
        metadata: withRequestMetadata(
          input.invoice.metadata,
          context.requestId || requestIdFrom(request)
        ),
      });

      if (!invoice.success) return invoice;

      return {
        success: true,
        data: {
          order: order.data,
          invoice: invoice.data,
        },
      };
    },

    async handleWebhook(request, event: PlatformWebhookEvent) {
      const context = await getContext(request);
      return runtime.adapter.handleWebhook(context, {
        ...event,
        metadata: withRequestMetadata(event.metadata, context.requestId || requestIdFrom(request)),
      });
    },
  };
}

export const pendingProductMutation = () =>
  unsupported<CommerceProduct>("Product mutation", "products");

export const pendingRentalAssetMutation = () =>
  unsupported<RentalAsset>("Rental asset mutation", "rentals");

export const pendingRepairCatalogMutation = () =>
  unsupported<RepairType>("Repair catalog mutation", "repairs");

export const pendingInvoiceLookup = () =>
  unsupported<PlatformInvoice>("Invoice lookup", "invoices");
