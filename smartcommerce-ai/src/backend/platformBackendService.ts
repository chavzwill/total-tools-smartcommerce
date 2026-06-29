import type {
  CommerceProduct,
  CustomerAccount,
  PlatformApiResult,
  PlatformEntityId,
  PlatformInvoice,
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

const pending = <T>(operation: string): PlatformApiResult<T> => ({
  success: false,
  error: {
    code: "BACKEND_ENDPOINT_PENDING_ADAPTER_SUPPORT",
    message: `${operation} requires an adapter method that is not part of the current provider contract.`,
  },
});

export function createPlatformBackendService(
  runtime: PlatformBackendRuntime
): PlatformBackendService {
  const getContext = (request: Request) => runtime.resolveContext(request);
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
    });
  };

  return {
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

    async listRentalAssets(request, query?: RentalAssetQuery) {
      const context = await getContext(request);
      return runtime.adapter.listRentalAssets(context, query);
    },

    async getRentalAssetById(request, rentalAssetId: PlatformEntityId) {
      const context = await getContext(request);
      return runtime.adapter.getRentalAssetById(context, rentalAssetId);
    },

    async getRentalAvailability(request, query: RentalAvailabilityQuery) {
      const context = await getContext(request);
      return runtime.adapter.getRentalAvailability(context, query);
    },

    async createRentalReservation(request, input) {
      const context = await getContext(request);
      return runtime.adapter.createRentalReservation(context, input);
    },

    async listRepairCatalog() {
      return {
        success: true,
        data: emptyPage<RepairType>(),
      };
    },

    async createRepairRequest(request, input) {
      const context = await getContext(request);
      return runtime.adapter.createRepairRequest(context, input);
    },

    async getRepairJobById(request, repairJobId: PlatformEntityId) {
      const context = await getContext(request);
      return runtime.adapter.getRepairJobById(context, repairJobId);
    },

    async createCommercialQuote(request, input) {
      const context = await getContext(request);
      return runtime.adapter.createCommercialQuote(context, input);
    },

    async createCustomer(request, input) {
      const context = await getContext(request);
      return runtime.adapter.createCustomer(context, input);
    },

    async getCustomerById(request, customerId) {
      const context = await getContext(request);
      return runtime.adapter.getCustomerById(context, customerId);
    },

    async createOrder(request, input) {
      const context = await getContext(request);
      return runtime.adapter.createOrder(context, input);
    },

    async getOrderById(request, orderId) {
      const context = await getContext(request);
      return runtime.adapter.getOrderById(context, orderId);
    },

    async createInvoice(request, input) {
      const context = await getContext(request);
      return runtime.adapter.createInvoice(context, input);
    },

    async getInvoiceById() {
      return pendingInvoiceLookup();
    },

    async runAssistant(request, input: AssistantRequest) {
      const context = await getContext(request);
      const [products, rentals] = await Promise.all([
        runtime.adapter.searchProducts(context, { search: input.prompt, pageSize: 5 }),
        runtime.adapter.listRentalAssets(context, { pageSize: 5 }),
      ]);

      if (!products.success) return products as PlatformApiResult<AssistantResult>;
      if (!rentals.success) return rentals as PlatformApiResult<AssistantResult>;

      return {
        success: true,
        data: {
          response:
            "The assistant matched the request against connected catalog and rental availability.",
          recommendedProducts: products.data.items,
          recommendedRentals: rentals.data.items,
          nextActions: ["review_recommendations", "check_availability", "submit_request"],
        },
      };
    },

    async checkout(request, input: CheckoutRequest) {
      const context = await getContext(request);

      const customer =
        input.customer &&
        (await runtime.adapter.createCustomer(context, input.customer));

      if (customer && !customer.success) return customer;

      const orderPayload: PlatformOrder = {
        ...input.order,
        customerAccountId:
          input.order.customerAccountId ||
          (customer && customer.success ? customer.data.id : undefined),
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
      return runtime.adapter.handleWebhook(context, event);
    },
  };
}

export const pendingProductMutation = () =>
  pending<CommerceProduct>("Product mutation");

export const pendingRentalAssetMutation = () =>
  pending<RentalAsset>("Rental asset mutation");

export const pendingRepairCatalogMutation = () =>
  pending<RepairType>("Repair catalog mutation");

export const pendingInvoiceLookup = () =>
  pending<PlatformInvoice>("Invoice lookup");
