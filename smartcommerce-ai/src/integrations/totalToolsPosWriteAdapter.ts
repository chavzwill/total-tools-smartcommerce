import { neon } from "@neondatabase/serverless";
import type {
  CustomerAccount,
  PlatformApiResult,
  PlatformOrder,
} from "../platform/contracts";
import type { PosAdapter, PosAdapterContext } from "../platform/posAdapter";
import {
  createTotalToolsPosReadAdapter,
  type TotalToolsPosReadAdapterOptions,
} from "./totalToolsPosReadAdapter.js";

type JsonRecord = Record<string, unknown>;

type GuardRow = {
  operation_key: string;
  status: string;
  provider_id: string | null;
  provider_result: unknown;
};

let sqlClient: ReturnType<typeof neon> | undefined;
let guardSchemaReady = false;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("POS_WRITE_GUARD_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

async function ensureGuardSchema() {
  if (guardSchemaReady) return;
  await sql()`CREATE TABLE IF NOT EXISTS pos_write_operations (
    operation_key TEXT PRIMARY KEY,
    operation_type TEXT NOT NULL,
    status TEXT NOT NULL,
    provider_id TEXT,
    provider_result JSONB,
    last_error_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  guardSchemaReady = true;
}

async function claimOperation(operationKey: string, operationType: string) {
  await ensureGuardSchema();
  const inserted = await sql()`
    INSERT INTO pos_write_operations (operation_key, operation_type, status)
    VALUES (${operationKey}, ${operationType}, 'in_progress')
    ON CONFLICT (operation_key) DO NOTHING
    RETURNING operation_key, status, provider_id, provider_result
  ` as unknown as GuardRow[];
  if (inserted[0]) return { claimed: true as const, row: inserted[0] };
  const existing = await sql()`
    SELECT operation_key, status, provider_id, provider_result
    FROM pos_write_operations WHERE operation_key=${operationKey} LIMIT 1
  ` as unknown as GuardRow[];
  return { claimed: false as const, row: existing[0] };
}

async function completeOperation(operationKey: string, providerId: string, result: unknown) {
  await sql()`UPDATE pos_write_operations
    SET status='succeeded', provider_id=${providerId}, provider_result=${JSON.stringify(result)}::jsonb,
        last_error_code=NULL, updated_at=NOW()
    WHERE operation_key=${operationKey}`;
}

async function markOperation(operationKey: string, status: "failed" | "uncertain", errorCode: string) {
  await sql()`UPDATE pos_write_operations
    SET status=${status}, last_error_code=${errorCode}, updated_at=NOW()
    WHERE operation_key=${operationKey}`;
}

function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : undefined;
}

function text(row: JsonRecord | undefined, key: string) {
  const value = row?.[key];
  return value === undefined || value === null ? undefined : String(value).trim() || undefined;
}

function numberValue(row: JsonRecord | undefined, key: string) {
  const value = row?.[key];
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function addressLine(address: CustomerAccount["billingAddress"]) {
  return [address?.line1, address?.line2].filter(Boolean).join(", ") || undefined;
}

function mapCustomer(context: PosAdapterContext, row: JsonRecord): CustomerAccount | undefined {
  const id = text(row, "id");
  if (!id) return undefined;
  return {
    id,
    businessAccountId: context.businessAccountId,
    firstName: text(row, "first_name"),
    lastName: text(row, "last_name"),
    email: text(row, "email"),
    phone: text(row, "phone"),
    billingAddress: {
      line1: text(row, "address"),
      city: text(row, "city"),
      region: text(row, "state"),
      postalCode: text(row, "zip"),
      countryCode: "JM",
    },
    externalRefs: [{ providerId: context.providerId, externalId: id, externalType: "customer" }],
    metadata: {
      source: "total-tools-pos",
      customerNumber: text(row, "customer_number") || null,
      customerType: text(row, "customer_type") || null,
    },
  };
}

function mapOrder(context: PosAdapterContext, row: JsonRecord): PlatformOrder | undefined {
  const id = text(row, "id");
  if (!id) return undefined;
  const rawItems = Array.isArray(row.items) ? row.items : [];
  const statusRaw = text(row, "status") || "submitted";
  const fulfillment = text(row, "fulfillment_status");
  const status = statusRaw === "completed"
    ? (fulfillment === "delivered" ? "fulfilled" : "processing")
    : statusRaw === "voided" ? "cancelled" : statusRaw;
  return {
    id,
    businessAccountId: context.businessAccountId,
    customerAccountId: text(row, "customer_id"),
    branchId: text(row, "branch_id"),
    status,
    currency: String(process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_CURRENCY || "JMD").toUpperCase(),
    lines: rawItems.map((value, index) => {
      const item = asRecord(value) || {};
      return {
        id: text(item, "id") || `${id}_line_${index + 1}`,
        productId: text(item, "product_id"),
        description: text(item, "product_name") || `Item ${index + 1}`,
        quantity: numberValue(item, "quantity") || 1,
        unitPrice: numberValue(item, "unit_price"),
        taxAmount: numberValue(item, "tax_amount"),
        totalAmount: numberValue(item, "total"),
      };
    }),
    subtotalAmount: numberValue(row, "subtotal"),
    taxAmount: numberValue(row, "tax_amount"),
    discountAmount: numberValue(row, "discount_amount"),
    totalAmount: numberValue(row, "total"),
    externalRefs: [{ providerId: context.providerId, externalId: id, externalType: "transaction" }],
    metadata: {
      source: "total-tools-pos",
      transactionNumber: text(row, "transaction_number") || null,
      paymentMethod: text(row, "payment_method") || null,
      fulfillmentStatus: fulfillment || null,
    },
  };
}

export function createTotalToolsPosWriteAdapter(options: TotalToolsPosReadAdapterOptions): PosAdapter {
  const readAdapter = createTotalToolsPosReadAdapter(options);
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const requestFetch = options.fetchImpl ?? fetch;
  const apiKeyHeader = options.apiKeyHeader || "X-API-Key";

  async function request<T>(
    context: PosAdapterContext,
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    query?: Record<string, string | number | undefined>,
  ): Promise<PlatformApiResult<T>> {
    const url = new URL(`${baseUrl}${path}`);
    Object.entries(query || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    });
    try {
      const response = await requestFetch(url, {
        method,
        headers: {
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(options.apiKey ? { [apiKeyHeader]: options.apiKey } : {}),
          ...(context.requestId ? { "X-Request-Id": context.requestId } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        return {
          success: false,
          error: {
            code: `TOTAL_TOOLS_POS_HTTP_${response.status}`,
            message: text(asRecord(payload), "error") || response.statusText || "Total Tools POS request failed.",
            details: payload,
            retryable: method === "GET" && response.status >= 500,
          },
          requestId: context.requestId,
        };
      }
      return { success: true, data: payload as T, requestId: context.requestId, syncedAt: new Date().toISOString() };
    } catch {
      return {
        success: false,
        error: {
          code: method === "POST" ? "TOTAL_TOOLS_POS_WRITE_UNCERTAIN" : "TOTAL_TOOLS_POS_NETWORK_ERROR",
          message: method === "POST"
            ? "The POS write result is uncertain and must be reconciled before retrying."
            : "Unable to reach the configured Total Tools POS API.",
          retryable: method === "GET",
        },
        requestId: context.requestId,
      };
    }
  }

  return {
    ...readAdapter,

    async healthCheck(context) {
      const result = await readAdapter.healthCheck(context);
      if (!result.success) return result;
      return {
        ...result,
        data: {
          ...result.data,
          capabilities: {
            ...result.data.capabilities,
            customers: Boolean(options.apiKey),
            orders: false,
            invoices: false,
          },
        },
      };
    },

    async getCustomerById(context, customerId) {
      const result = await request<unknown>(context, "GET", `/api/customers/${encodeURIComponent(customerId)}`);
      if (!result.success) return result;
      const mapped = mapCustomer(context, asRecord(result.data) || {});
      return mapped
        ? { ...result, data: mapped }
        : { success: false, error: { code: "TOTAL_TOOLS_POS_CUSTOMER_INVALID", message: "The POS returned an invalid customer record." }, requestId: context.requestId };
    },

    async createCustomer(context, customer) {
      const firstName = String(customer.firstName || "").trim();
      const lastName = String(customer.lastName || "").trim();
      if (!firstName || !lastName) {
        return { success: false, error: { code: "TOTAL_TOOLS_POS_CUSTOMER_NAME_REQUIRED", message: "First and last name are required before synchronizing a POS customer." }, requestId: context.requestId };
      }

      const identity = String(customer.email || customer.phone || "").trim();
      if (identity) {
        const existing = await request<unknown>(context, "GET", "/api/customers", undefined, { search: identity });
        if (!existing.success) return existing as PlatformApiResult<CustomerAccount>;
        const rows = Array.isArray(existing.data) ? existing.data : [];
        const exact = rows.map(asRecord).find((row) => {
          if (!row) return false;
          const emailMatches = customer.email && String(row.email || "").trim().toLowerCase() === customer.email.trim().toLowerCase();
          const phoneMatches = customer.phone && String(row.phone || "").replace(/\D/g, "") === customer.phone.replace(/\D/g, "");
          return Boolean(emailMatches || phoneMatches);
        });
        if (exact) {
          const mapped = mapCustomer(context, exact);
          if (mapped) return { success: true, data: mapped, requestId: context.requestId, syncedAt: new Date().toISOString() };
        }
      }

      const billing = customer.billingAddress || customer.shippingAddress;
      const payload = {
        first_name: firstName,
        last_name: lastName,
        email: customer.email || null,
        phone: customer.phone || null,
        address: addressLine(billing) || null,
        city: billing?.city || null,
        state: billing?.region || null,
        zip: billing?.postalCode || null,
        notes: [
          customer.companyName ? `Company: ${customer.companyName}` : "",
          `SmartCommerce customer: ${customer.id}`,
        ].filter(Boolean).join(" | "),
        customer_type: String(customer.metadata?.customerType || "cash"),
        tax_exempt: Boolean(customer.metadata?.taxExempt),
        tax_exemption_number: customer.taxIdentifier || null,
      };
      const created = await request<unknown>(context, "POST", "/api/customers", payload);
      if (!created.success) return created as PlatformApiResult<CustomerAccount>;
      const mapped = mapCustomer(context, asRecord(created.data) || {});
      return mapped
        ? { ...created, data: mapped }
        : { success: false, error: { code: "TOTAL_TOOLS_POS_CUSTOMER_INVALID", message: "The POS created a customer but returned an invalid record. Reconcile before retrying." }, requestId: context.requestId };
    },

    async getOrderById(context, orderId) {
      const result = await request<unknown>(context, "GET", `/api/transactions/${encodeURIComponent(orderId)}`);
      if (!result.success) return result;
      const mapped = mapOrder(context, asRecord(result.data) || {});
      return mapped
        ? { ...result, data: mapped }
        : { success: false, error: { code: "TOTAL_TOOLS_POS_ORDER_INVALID", message: "The POS returned an invalid transaction record." }, requestId: context.requestId };
    },

    async createOrder(context, order) {
      const settlementMethod = String(order.metadata?.settlementMethod || "");
      if (settlementMethod !== "commercial_account_credit") {
        return { success: false, error: { code: "TOTAL_TOOLS_POS_ORDER_SETTLEMENT_UNSUPPORTED", message: "The POS write adapter currently accepts only verified commercial-account credit orders." }, requestId: context.requestId };
      }
      const deliveryMinor = Number(order.metadata?.deliveryMinor || 0);
      const merchandiseTotal = Number(order.subtotalAmount || 0) + Number(order.taxAmount || 0) - Number(order.discountAmount || 0);
      if (deliveryMinor > 0 || Math.abs(Number(order.totalAmount || 0) - merchandiseTotal) > 0.01) {
        return { success: false, error: { code: "TOTAL_TOOLS_POS_NON_MERCHANDISE_CHARGES_UNSUPPORTED", message: "The current POS transaction contract cannot safely represent SmartCommerce delivery or other non-merchandise charges." }, requestId: context.requestId };
      }
      if (!order.lines.length || order.lines.some((line) => !line.productId || !Number.isInteger(line.quantity) || line.quantity <= 0)) {
        return { success: false, error: { code: "TOTAL_TOOLS_POS_ORDER_LINES_INVALID", message: "Every POS order line requires a valid product and positive whole-number quantity." }, requestId: context.requestId };
      }
      const providerCustomerId = String(order.metadata?.providerCommercialAccountId || order.metadata?.providerCustomerId || "").trim();
      if (!providerCustomerId) {
        return { success: false, error: { code: "TOTAL_TOOLS_POS_CUSTOMER_MAPPING_REQUIRED", message: "A verified POS customer mapping is required for commercial-account checkout." }, requestId: context.requestId };
      }
      const employeeId = String(process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_ONLINE_EMPLOYEE_ID || "").trim();
      if (!employeeId) {
        return { success: false, error: { code: "TOTAL_TOOLS_POS_ONLINE_EMPLOYEE_REQUIRED", message: "Configure the dedicated ecommerce POS employee before enabling online order writes." }, requestId: context.requestId };
      }

      const operationKey = `order:${context.providerId}:${order.id}`;
      const claim = await claimOperation(operationKey, "order_create").catch(() => null);
      if (!claim) {
        return { success: false, error: { code: "TOTAL_TOOLS_POS_WRITE_GUARD_UNAVAILABLE", message: "The POS duplicate-write guard is temporarily unavailable.", retryable: true }, requestId: context.requestId };
      }
      if (!claim.claimed) {
        if (claim.row?.status === "succeeded" && claim.row.provider_result) {
          const mapped = mapOrder(context, asRecord(claim.row.provider_result) || {});
          if (mapped) return { success: true, data: mapped, requestId: context.requestId, syncedAt: new Date().toISOString() };
        }
        return { success: false, error: { code: "TOTAL_TOOLS_POS_ORDER_WRITE_ALREADY_CLAIMED", message: "This order write has already been attempted. Reconcile the existing operation before retrying." }, requestId: context.requestId };
      }

      const payload = {
        customer_id: providerCustomerId,
        employee_id: employeeId,
        branch_id: order.branchId || null,
        items: order.lines.map((line) => ({ product_id: line.productId, quantity: line.quantity })),
        discount_amount: Number(order.discountAmount || 0),
        payment_method: "credit",
        amount_tendered: 0,
        notes: [
          `SmartCommerce order: ${order.id}`,
          order.metadata?.purchaseOrderReference ? `PO: ${order.metadata.purchaseOrderReference}` : "",
          order.metadata?.checkoutQuoteId ? `Quote: ${order.metadata.checkoutQuoteId}` : "",
        ].filter(Boolean).join(" | "),
      };

      const created = await request<unknown>(context, "POST", "/api/transactions", payload);
      if (!created.success) {
        const uncertain = created.error.code === "TOTAL_TOOLS_POS_WRITE_UNCERTAIN";
        await markOperation(operationKey, uncertain ? "uncertain" : "failed", created.error.code).catch(() => {});
        return created as PlatformApiResult<PlatformOrder>;
      }
      const raw = asRecord(created.data) || {};
      const mapped = mapOrder(context, raw);
      if (!mapped) {
        await markOperation(operationKey, "uncertain", "TOTAL_TOOLS_POS_ORDER_INVALID").catch(() => {});
        return { success: false, error: { code: "TOTAL_TOOLS_POS_ORDER_INVALID", message: "The POS accepted the order but returned an invalid record. Reconcile before retrying." }, requestId: context.requestId };
      }
      await completeOperation(operationKey, mapped.id, raw).catch(() => {});
      return { ...created, data: mapped };
    },
  };
}
