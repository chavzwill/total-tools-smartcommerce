const emptyPage = () => ({
    items: [],
    hasNextPage: false,
    total: 0,
    page: 1,
    pageSize: 0,
});
const unsupported = (operation, capability) => ({
    success: false,
    error: {
        code: "POS_ADAPTER_CAPABILITY_UNSUPPORTED",
        message: `${operation} is not available for the active provider adapter.`,
        details: { capability },
    },
});
const requestIdFrom = (request) => request.headers.get("x-request-id") ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const withRequestMetadata = (metadata, requestId) => ({
    ...(metadata || {}),
    requestId,
    source: "smartcommerce-platform-backend",
});
export function createPlatformBackendService(runtime) {
    const getContext = async (request) => {
        const context = await runtime.resolveContext(request);
        return {
            ...context,
            requestId: context.requestId || requestIdFrom(request),
        };
    };
    const requestSync = async (request, scope) => {
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
        syncProducts(request) {
            return requestSync(request, "products");
        },
        syncRentals(request) {
            return requestSync(request, "rentals");
        },
        syncRepairs(request) {
            return requestSync(request, "repairs");
        },
        async searchProducts(request, query) {
            const context = await getContext(request);
            return runtime.adapter.searchProducts(context, query);
        },
        async getProductById(request, productId) {
            const context = await getContext(request);
            return runtime.adapter.getProductById(context, productId);
        },
        async createProduct(request, input) {
            const context = await getContext(request);
            if (!runtime.adapter.createProduct) {
                return unsupported("Product creation", "products");
            }
            return runtime.adapter.createProduct(context, {
                ...input,
                metadata: withRequestMetadata(input.metadata, context.requestId || requestIdFrom(request)),
            });
        },
        async updateProduct(request, productId, input) {
            const context = await getContext(request);
            if (!runtime.adapter.updateProduct) {
                return unsupported("Product update", "products");
            }
            return runtime.adapter.updateProduct(context, productId, {
                ...input,
                metadata: withRequestMetadata(input.metadata, context.requestId || requestIdFrom(request)),
            });
        },
        async deleteProduct(request, productId) {
            const context = await getContext(request);
            if (!runtime.adapter.deleteProduct) {
                return unsupported("Product deletion", "products");
            }
            return runtime.adapter.deleteProduct(context, productId);
        },
        async listRentalAssets(request, query) {
            const context = await getContext(request);
            return runtime.adapter.listRentalAssets(context, query);
        },
        async getRentalAssetById(request, rentalAssetId) {
            const context = await getContext(request);
            return runtime.adapter.getRentalAssetById(context, rentalAssetId);
        },
        async createRentalAsset(request, input) {
            const context = await getContext(request);
            if (!runtime.adapter.createRentalAsset) {
                return unsupported("Rental asset creation", "rentals");
            }
            return runtime.adapter.createRentalAsset(context, {
                ...input,
                metadata: withRequestMetadata(input.metadata, context.requestId || requestIdFrom(request)),
            });
        },
        async updateRentalAsset(request, rentalAssetId, input) {
            const context = await getContext(request);
            if (!runtime.adapter.updateRentalAsset) {
                return unsupported("Rental asset update", "rentals");
            }
            return runtime.adapter.updateRentalAsset(context, rentalAssetId, {
                ...input,
                metadata: withRequestMetadata(input.metadata, context.requestId || requestIdFrom(request)),
            });
        },
        async deleteRentalAsset(request, rentalAssetId) {
            const context = await getContext(request);
            if (!runtime.adapter.deleteRentalAsset) {
                return unsupported("Rental asset deletion", "rentals");
            }
            return runtime.adapter.deleteRentalAsset(context, rentalAssetId);
        },
        async getRentalAvailability(request, query) {
            const context = await getContext(request);
            return runtime.adapter.getRentalAvailability(context, query);
        },
        async createRentalReservation(request, input) {
            const context = await getContext(request);
            return runtime.adapter.createRentalReservation(context, {
                ...input,
                metadata: withRequestMetadata(input.metadata, context.requestId || requestIdFrom(request)),
            });
        },
        async listRepairCatalog(request) {
            const context = await getContext(request);
            if (!runtime.adapter.listRepairCatalog) {
                return {
                    success: true,
                    data: emptyPage(),
                };
            }
            return runtime.adapter.listRepairCatalog(context);
        },
        async createRepairCatalogItem(request, input) {
            const context = await getContext(request);
            if (!runtime.adapter.createRepairCatalogItem) {
                return unsupported("Repair catalog creation", "repairs");
            }
            return runtime.adapter.createRepairCatalogItem(context, input);
        },
        async updateRepairCatalogItem(request, repairTypeId, input) {
            const context = await getContext(request);
            if (!runtime.adapter.updateRepairCatalogItem) {
                return unsupported("Repair catalog update", "repairs");
            }
            return runtime.adapter.updateRepairCatalogItem(context, repairTypeId, input);
        },
        async deleteRepairCatalogItem(request, repairTypeId) {
            const context = await getContext(request);
            if (!runtime.adapter.deleteRepairCatalogItem) {
                return unsupported("Repair catalog deletion", "repairs");
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
        async getRepairJobById(request, repairJobId) {
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
                return unsupported("Invoice lookup", "invoices");
            }
            return runtime.adapter.getInvoiceById(context, invoiceId);
        },
        async runAssistant(request, input) {
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
            if (!products.success)
                return products;
            if (!rentals.success)
                return rentals;
            const hasRecommendations = products.data.items.length > 0 || rentals.data.items.length > 0;
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
        async checkout(request, input) {
            const context = await getContext(request);
            const customer = input.customer &&
                (await runtime.adapter.createCustomer(context, {
                    ...input.customer,
                    metadata: withRequestMetadata(input.customer.metadata, context.requestId || requestIdFrom(request)),
                }));
            if (customer && !customer.success)
                return customer;
            const orderPayload = {
                ...input.order,
                customerAccountId: input.order.customerAccountId ||
                    (customer && customer.success ? customer.data.id : undefined),
                metadata: withRequestMetadata(input.order.metadata, context.requestId || requestIdFrom(request)),
            };
            const order = await runtime.adapter.createOrder(context, orderPayload);
            if (!order.success)
                return order;
            if (!input.invoice) {
                return {
                    success: true,
                    data: { order: order.data },
                };
            }
            const invoice = await runtime.adapter.createInvoice(context, {
                ...input.invoice,
                orderId: input.invoice.orderId || order.data.id,
                metadata: withRequestMetadata(input.invoice.metadata, context.requestId || requestIdFrom(request)),
            });
            if (!invoice.success)
                return invoice;
            return {
                success: true,
                data: {
                    order: order.data,
                    invoice: invoice.data,
                },
            };
        },
        async handleWebhook(request, event) {
            const context = await getContext(request);
            return runtime.adapter.handleWebhook(context, {
                ...event,
                metadata: withRequestMetadata(event.metadata, context.requestId || requestIdFrom(request)),
            });
        },
    };
}
export const pendingProductMutation = () => unsupported("Product mutation", "products");
export const pendingRentalAssetMutation = () => unsupported("Rental asset mutation", "rentals");
export const pendingRepairCatalogMutation = () => unsupported("Repair catalog mutation", "repairs");
export const pendingInvoiceLookup = () => unsupported("Invoice lookup", "invoices");
