import type { SmartCommercePosExportManifest } from "./posOperationsContracts";

export const POS_EXPORT_SCHEMA_VERSION = "1.0" as const;

export const buildSmartCommercePosExportManifest = (input: {
  businessAccountId: string;
  providerId: string;
  generatedAt?: string;
}): SmartCommercePosExportManifest => ({
  schemaVersion: POS_EXPORT_SCHEMA_VERSION,
  businessAccountId: input.businessAccountId,
  providerId: input.providerId,
  generatedAt: input.generatedAt || new Date().toISOString(),
  resources: [
    { name: "branches", endpoint: "/api/platform/branches", modes: ["snapshot", "incremental"], cursorSupported: true },
    { name: "categories", endpoint: "/api/platform/categories", modes: ["snapshot", "incremental"], cursorSupported: true },
    { name: "products", endpoint: "/api/platform/products", modes: ["snapshot", "incremental", "realtime"], cursorSupported: true, webhookEvents: ["product.created", "product.updated", "product.deleted"] },
    { name: "inventory", endpoint: "/api/platform/inventory", modes: ["snapshot", "incremental", "realtime"], cursorSupported: true, webhookEvents: ["inventory.changed", "inventory.reserved", "inventory.released"] },
    { name: "customers", endpoint: "/api/platform/customers", modes: ["snapshot", "incremental", "realtime"], cursorSupported: true, webhookEvents: ["customer.created", "customer.updated"] },
    { name: "orders", endpoint: "/api/platform/orders", modes: ["snapshot", "incremental", "realtime"], cursorSupported: true, webhookEvents: ["order.created", "order.updated", "order.fulfilled", "order.cancelled"] },
    { name: "invoices", endpoint: "/api/platform/invoices", modes: ["snapshot", "incremental", "realtime"], cursorSupported: true, webhookEvents: ["invoice.issued", "invoice.paid", "invoice.voided", "invoice.overdue"] },
    { name: "rentals", endpoint: "/api/platform/rentals", modes: ["snapshot", "incremental", "realtime"], cursorSupported: true, webhookEvents: ["rental.created", "rental.reserved", "rental.checked_out", "rental.returned", "rental.overdue"] },
    { name: "work_orders", endpoint: "/api/platform/operations/work-orders", modes: ["snapshot", "incremental", "realtime"], cursorSupported: true, webhookEvents: ["work_order.created", "work_order.updated", "work_order.status_changed", "work_order.completed"] },
    { name: "technicians", endpoint: "/api/platform/operations/technicians", modes: ["snapshot", "incremental"], cursorSupported: true, webhookEvents: ["technician.updated"] },
    { name: "technician_skills", endpoint: "/api/platform/operations/technician-skills", modes: ["snapshot", "incremental"], cursorSupported: true },
    { name: "technician_schedule", endpoint: "/api/platform/operations/technician-schedule", modes: ["snapshot", "incremental", "realtime"], cursorSupported: true, webhookEvents: ["technician_schedule.changed"] },
    { name: "technician_performance", endpoint: "/api/platform/operations/technician-performance", modes: ["snapshot", "incremental"], cursorSupported: true },
    { name: "suppliers", endpoint: "/api/platform/operations/suppliers", modes: ["snapshot", "incremental"], cursorSupported: true },
    { name: "purchase_requests", endpoint: "/api/platform/operations/purchase-requests", modes: ["snapshot", "incremental", "realtime"], cursorSupported: true, webhookEvents: ["purchase_request.created", "purchase_request.updated"] },
    { name: "purchase_orders", endpoint: "/api/platform/operations/purchase-orders", modes: ["snapshot", "incremental", "realtime"], cursorSupported: true, webhookEvents: ["purchase_order.created", "purchase_order.updated", "purchase_order.received"] },
    { name: "branch_transfers", endpoint: "/api/platform/operations/branch-transfers", modes: ["snapshot", "incremental", "realtime"], cursorSupported: true, webhookEvents: ["branch_transfer.created", "branch_transfer.shipped", "branch_transfer.received"] },
    { name: "quotations", endpoint: "/api/platform/operations/quotations", modes: ["snapshot", "incremental", "realtime"], cursorSupported: true, webhookEvents: ["quotation.created", "quotation.updated", "quotation.accepted", "quotation.declined"] },
    { name: "transactions", endpoint: "/api/platform/operations/transactions", modes: ["snapshot", "incremental", "realtime"], cursorSupported: true, webhookEvents: ["transaction.posted", "transaction.refunded"] },
    { name: "cash_drawers", endpoint: "/api/platform/operations/cash-drawers", modes: ["snapshot", "incremental", "realtime"], cursorSupported: true, webhookEvents: ["cash_drawer.opened", "cash_drawer.closed", "cash_drawer.variance"] },
    { name: "audit_events", endpoint: "/api/platform/operations/audit-events", modes: ["incremental", "realtime"], cursorSupported: true, webhookEvents: ["audit_event.created"] },
  ],
  metadata: {
    source: "total-tools-pos",
    contract: "smartcommerce-pos-operations",
  },
});
