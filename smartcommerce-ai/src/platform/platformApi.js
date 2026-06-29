export class SmartCommercePlatformApi {
    adapter;
    context;
    constructor(options) {
        this.adapter = options.adapter;
        this.context = options.context;
    }
    healthCheck() {
        return this.adapter.healthCheck(this.context);
    }
    listBranches() {
        return this.adapter.listBranches(this.context);
    }
    listCategories() {
        return this.adapter.listCategories(this.context);
    }
    searchProducts(query) {
        return this.adapter.searchProducts(this.context, query);
    }
    getProductById(productId) {
        return this.adapter.getProductById(this.context, productId);
    }
    getInventoryAvailability(query) {
        return this.adapter.getInventoryAvailability(this.context, query);
    }
    listRentalAssets(query) {
        return this.adapter.listRentalAssets(this.context, query);
    }
    getRentalAssetById(rentalAssetId) {
        return this.adapter.getRentalAssetById(this.context, rentalAssetId);
    }
    getRentalAvailability(query) {
        return this.adapter.getRentalAvailability(this.context, query);
    }
    createRentalReservation(request) {
        return this.adapter.createRentalReservation(this.context, request);
    }
    createRepairRequest(request) {
        return this.adapter.createRepairRequest(this.context, request);
    }
    getRepairJobById(repairJobId) {
        return this.adapter.getRepairJobById(this.context, repairJobId);
    }
    createCommercialQuote(request) {
        return this.adapter.createCommercialQuote(this.context, request);
    }
    createCustomer(customer) {
        return this.adapter.createCustomer(this.context, customer);
    }
    getCustomerById(customerId) {
        return this.adapter.getCustomerById(this.context, customerId);
    }
    createOrder(order) {
        return this.adapter.createOrder(this.context, order);
    }
    getOrderById(orderId) {
        return this.adapter.getOrderById(this.context, orderId);
    }
    createInvoice(invoice) {
        return this.adapter.createInvoice(this.context, invoice);
    }
    handleWebhook(event) {
        return this.adapter.handleWebhook(this.context, event);
    }
}
