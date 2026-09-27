import type { SmartCommercePosExportManifest } from "./posOperationsContracts";
import { TECHNICIAN_EVIDENCE_EXPORT_CONTRACTS } from "./technicianEvidenceContracts.js";

export const POS_EXPORT_SCHEMA_VERSION = "1.0" as const;

export const POS_EXPORT_CONTRACTS = [
  { name: "branches", endpoint: "/api/platform/branches", status: "available" },
  { name: "categories", endpoint: "/api/platform/categories", status: "available" },
  { name: "products", endpoint: "/api/platform/products", status: "available" },
  { name: "inventory", endpoint: "/api/platform/inventory/availability", status: "partial" },
  { name: "customers", endpoint: "/api/platform/customers", status: "partial" },
  { name: "orders", endpoint: "/api/platform/orders", status: "partial" },
  { name: "invoices", endpoint: "/api/platform/invoices", status: "partial" },
  { name: "rentals", endpoint: "/api/platform/rentals", status: "available" },
  { name: "work_orders", endpoint: "/api/platform/operations/work-orders", status: "contract_only" },
  { name: "technicians", endpoint: "/api/platform/operations/technicians", status: "contract_only" },
  { name: "technician_skills", endpoint: "/api/platform/operations/technician-skills", status: "contract_only" },
  { name: "technician_schedule", endpoint: "/api/platform/operations/technician-schedule", status: "contract_only" },
  { name: "technician_performance", endpoint: "/api/platform/operations/technician-performance", status: "contract_only" },
  ...TECHNICIAN_EVIDENCE_EXPORT_CONTRACTS.map((resource) => ({
    name: resource.name,
    endpoint: resource.endpoint,
    status: "contract_only" as const,
    requiredFor: resource.requiredFor,
  })),
  { name: "suppliers", endpoint: "/api/platform/operations/suppliers", status: "contract_only" },
  { name: "purchase_requests", endpoint: "/api/platform/operations/purchase-requests", status: "contract_only" },
  { name: "purchase_orders", endpoint: "/api/platform/operations/purchase-orders", status: "contract_only" },
  { name: "branch_transfers", endpoint: "/api/platform/operations/branch-transfers", status: "contract_only" },
  { name: "quotations", endpoint: "/api/platform/operations/quotations", status: "contract_only" },
  { name: "transactions", endpoint: "/api/platform/operations/transactions", status: "contract_only" },
  { name: "cash_drawers", endpoint: "/api/platform/operations/cash-drawers", status: "contract_only" },
  { name: "audit_events", endpoint: "/api/platform/operations/audit-events", status: "contract_only" },
] as const;

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
    { name: "branches", endpoint: "/api/platform/branches", modes: ["snapshot"] },
    { name: "categories", endpoint: "/api/platform/categories", modes: ["snapshot"], cursorSupported: true },
    { name: "products", endpoint: "/api/platform/products", modes: ["snapshot"], cursorSupported: true },
    { name: "rentals", endpoint: "/api/platform/rentals", modes: ["snapshot"], cursorSupported: true },
  ],
  metadata: {
    source: "total-tools-pos",
    contract: "smartcommerce-pos-operations",
    plannedResourceCount: POS_EXPORT_CONTRACTS.filter((resource) => resource.status === "contract_only").length,
    partialResourceCount: POS_EXPORT_CONTRACTS.filter((resource) => resource.status === "partial").length,
    technicianEvidenceContractCount: TECHNICIAN_EVIDENCE_EXPORT_CONTRACTS.length,
  },
});
