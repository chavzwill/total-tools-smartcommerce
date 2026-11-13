import type {
  Branch,
  CommerceProduct,
  InventoryAvailability,
  PlatformApiResult,
  PlatformEntityId,
  PlatformInvoice,
  PlatformOrder,
  PlatformPage,
  PlatformSyncResult,
  PlatformWebhookEvent,
  ProductCategory,
  RentalAsset,
  RentalReservationRequest,
  RentalReservationResult,
  RepairJob,
  RepairRequest,
  CommercialQuoteRequest,
  CommercialQuoteResult,
  CustomerAccount,
} from "../platform/contracts";
import type {
  InventoryAvailabilityQuery,
  PosAdapter,
  PosAdapterContext,
  PosAdapterHealthStatus,
  ProductSearchQuery,
  RentalAssetQuery,
  RentalAvailabilityQuery,
} from "../platform/posAdapter";

export type TotalToolsPosReadAdapterOptions = {
  baseUrl: string;
  apiKey?: string;
  apiKeyHeader?: string;
  // Server-only Vercel deployment-protection bypass for the trusted POS host.
  // This is NOT the POS API key and never belongs in VITE_ variables.
  deploymentProtectionBypass?: string;
  defaultCurrency?: string;
  fetchImpl?: typeof fetch;
};

type JsonRecord = Record<string, unknown>;

const unsupported = <T>(operation: string): PlatformApiResult<T> => ({
  success: false,
  error: {
    code: "TOTAL_TOOLS_POS_READ_ONLY",
    message: `${operation} is not enabled on the read-only Total Tools POS adapter.`,
    retryable: false,
  },
});

const trimSlash = (value: string) => value.replace(/\/+$/, "");
const asRecord = (value: unknown): JsonRecord | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;

const firstValue = (row: JsonRecord, keys: string[]) => {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
};

const textValue = (row: JsonRecord, keys: string[]) => {
  const value = firstValue(row, keys);
  return value === undefined ? undefined : String(value).trim() || undefined;
};

const numberValue = (row: JsonRecord, keys: string[]) => {
  const value = firstValue(row, keys);
  if (value === undefined) return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const booleanValue = (row: JsonRecord, keys: string[]) => {
  const value = firstValue(row, keys);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "active", "enabled"].includes(normalized)) return true;
    if (["0", "false", "no", "inactive", "disabled"].includes(normalized)) return false;
  }
  return undefined;
};

const rowsFromPayload = (payload: unknown): JsonRecord[] => {
  if (Array.isArray(payload)) return payload.map(asRecord).filter(Boolean) as JsonRecord[];
  const record = asRecord(payload);
  if (!record) return [];
  for (const key of ["items", "rows", "data", "products", "categories", "branches"]) {
    const value = record[key];
    if (Array.isArray(value)) return value.map(asRecord).filter(Boolean) as JsonRecord[];
  }
  return [];
};

const pageFromRows = <T>(items: T[], payload?: unknown): PlatformPage<T> => {
  const record = asRecord(payload);
  const total = record ? numberValue(record, ["total", "count", "total_count"]) : undefined;
  const page = record ? numberValue(record, ["page", "page_number"]) : undefined;
  const pageSize = record ? numberValue(record, ["pageSize", "page_size", "limit"]) : undefined;
  return {
    items,
    total: total ?? items.length,
    page,
    pageSize,
    hasNextPage:
      typeof record?.hasNextPage === "boolean"
        ? record.hasNextPage
        : typeof record?.has_next_page === "boolean"
          ? record.has_next_page
          : false,
  };
};

export function createTotalToolsPosReadAdapter(
  options: TotalToolsPosReadAdapterOptions
): PosAdapter {
  const baseUrl = trimSlash(options.baseUrl);
  const requestFetch = options.fetchImpl ?? fetch;
  const apiKeyHeader = options.apiKeyHeader || "X-API-Key";
  const currency = options.defaultCurrency || "JMD";
  const protectedVercelHost = new URL(baseUrl).hostname.toLowerCase().endsWith(".vercel.app");

  const request = async <T>(
    context: PosAdapterContext,
    path: string,
    query?: Record<string, string | number | boolean | undefined>
  ): Promise<PlatformApiResult<T>> => {
    const url = new URL(`${baseUrl}${path}`);
    Object.entries(query || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    });

    try {
      const response = await requestFetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(options.apiKey ? { [apiKeyHeader]: options.apiKey } : {}),
          ...(protectedVercelHost && options.deploymentProtectionBypass
            ? { "X-Vercel-Protection-Bypass": options.deploymentProtectionBypass }
            : {}),
          ...(context.requestId ? { "X-Request-Id": context.requestId } : {}),
        },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        return {
          success: false,
          error: {
            code: `TOTAL_TOOLS_POS_HTTP_${response.status}`,
            message: asRecord(payload)?.error
              ? String(asRecord(payload)?.error)
              : response.statusText || "Total Tools POS request failed.",
            details: payload,
            retryable: response.status >= 500,
          },
          requestId: context.requestId,
        };
      }
      return {
        success: true,
        data: payload as T,
        requestId: context.requestId,
        syncedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "TOTAL_TOOLS_POS_NETWORK_ERROR",
          message: "Unable to reach the configured Total Tools POS API.",
          details: error,
          retryable: true,
        },
        requestId: context.requestId,
      };
    }
  };

  const mapBranch = (context: PosAdapterContext, row: JsonRecord): Branch | undefined => {
    const id = textValue(row, ["id", "branch_id", "branchId"]);
    const name = textValue(row, ["name", "branch_name", "branchName"]);
    if (!id || !name) return undefined;
    return {
      id,
      businessAccountId: context.businessAccountId,
      name,
      code: textValue(row, ["code", "branch_code"]),
      phone: textValue(row, ["phone", "telephone"]),
      email: textValue(row, ["email"]),
      active: booleanValue(row, ["is_active", "active"]) ?? true,
      externalRefs: [{ providerId: context.providerId, externalId: id, externalType: "branch" }],
      metadata: { source: "total-tools-pos" },
    };
  };

  const mapCategory = (context: PosAdapterContext, row: JsonRecord): ProductCategory | undefined => {
    const id = textValue(row, ["id", "category_id", "categoryId"]);
    const name = textValue(row, ["name", "category_name", "categoryName"]);
    if (!id || !name) return undefined;
    return {
      id,
      businessAccountId: context.businessAccountId,
      parentId: textValue(row, ["parent_id", "parentId"]),
      name,
      description: textValue(row, ["description"]),
      active: booleanValue(row, ["is_active", "active"]) ?? true,
      externalRefs: [{ providerId: context.providerId, externalId: id, externalType: "category" }],
      metadata: { source: "total-tools-pos" },
    };
  };

  const mapProduct = (context: PosAdapterContext, row: JsonRecord, expectedBranchId?: string): CommerceProduct | undefined => {
    const id = textValue(row, ["id", "product_id", "productId"]);
    const name = textValue(row, ["name", "product_name", "productName", "description"]);
    if (!id || !name) return undefined;

    const productType = textValue(row, ["product_type", "productType", "type"])?.toLowerCase();
    const price = numberValue(row, ["price", "selling_price", "sale_price", "unit_price"]);
    const imagePath = textValue(row, ["image_path", "image", "image_url"]);
    const categoryId = textValue(row, ["category_id", "categoryId"]);
    const brand = textValue(row, ["brand", "brand_name", "manufacturer"]);
    const modelNumber = textValue(row, ["model_number", "modelNumber"]);
    const manufacturerPartNumber = textValue(row, [
      "manufacturer_part_number",
      "manufacturerPartNumber",
      "oem_part_number",
      "oemPartNumber",
      "mpn",
    ]);
    const serviceFlag = booleanValue(row, ["is_service", "service"]);
    const rentalFlag = booleanValue(row, ["is_rental", "rental"]);
    const explicitRentable = booleanValue(row, ["rentable", "is_rentable", "rental_enabled"]);
    // The POS's published catalogue now carries explicit branch fields.
    // Do not treat global stock_qty as a branch snapshot. Require a matching
    // branch ID from the trusted POS response, including for zero quantity.
    const returnedBranchId = textValue(row, ["branch_id", "branchId"]);
    const branchQuantity = numberValue(row, ["branch_stock_qty", "branchStockQty"]);
    const branchMinimum = numberValue(row, ["branch_min_stock", "branchMinStock"]);
    const branchStockVerified = Boolean(expectedBranchId &&
      returnedBranchId === expectedBranchId && branchQuantity !== undefined);

    return {
      id,
      businessAccountId: context.businessAccountId,
      sku: textValue(row, ["sku", "item_code", "product_code", "code"]),
      barcode: textValue(row, ["barcode", "upc", "ean"]),
      name,
      brand,
      categoryIds: categoryId ? [categoryId] : undefined,
      description: textValue(row, ["description", "long_description"]),
      images: imagePath
        ? [{
            url: /^https?:\/\//i.test(imagePath)
              ? imagePath
              : `${baseUrl}/${imagePath.replace(/^\/+/, "")}`,
            altText: name,
            source: "external",
          }]
        : undefined,
      pricing: price !== undefined
        ? [{ currency, listPrice: price, taxInclusive: undefined }]
        : undefined,
      // The POS exposes is_service / is_rental instead of product_type.
      // Never offer a normal retail Add-to-Cart action for these records.
      purchasable: serviceFlag === true || rentalFlag === true
        ? false
        : productType ? !["service", "rental"].includes(productType) : undefined,
      rentable: explicitRentable ?? (rentalFlag === true || productType === "rental" ? true : undefined),
      repairable: booleanValue(row, ["repairable", "is_repairable"]),
      taxable: booleanValue(row, ["taxable", "is_taxable", "track_tax"]),
      active: (booleanValue(row, ["is_active", "active"]) ?? true) &&
        (booleanValue(row, ["online_available", "onlineAvailable"]) ?? true),
      attributes: {
        ...(brand ? { Brand: brand } : {}),
        ...(modelNumber && !manufacturerPartNumber ? { Model: modelNumber } : {}),
        ...(manufacturerPartNumber ? { "Manufacturer Part Number": manufacturerPartNumber } : {}),
        ...(productType ? { productType } : {}),
        ...(numberValue(row, ["stock_qty"]) !== undefined
          ? { stockQuantity: numberValue(row, ["stock_qty"]) as number }
          : {}),
      },
      externalRefs: [{ providerId: context.providerId, externalId: id, externalType: "product" }],
      metadata: {
        source: "total-tools-pos",
        ...(branchStockVerified
          ? {
              branchStockId: expectedBranchId as string,
              branchStockQty: branchQuantity as number,
              ...(branchMinimum !== undefined ? { branchMinStock: branchMinimum } : {}),
            }
          : {}),
      },
    };
  };

  const inventoryFromProduct = (
    context: PosAdapterContext,
    row: JsonRecord,
    productId: string,
    branchId?: string
  ): InventoryAvailability => {
    // A branch-scoped request must never borrow aggregate or another branch's
    // stock quantities. Older POS endpoints may return only global stock.
    // That is an unknown branch result, not proof that this branch has stock.
    const branchScoped = Boolean(branchId);
    const onHand = branchScoped
      ? numberValue(row, ["branch_stock_qty", "branchStockQty"])
      : numberValue(row, ["stock_qty", "quantity_on_hand", "qty_on_hand"]);
    const available = branchScoped
      ? numberValue(row, ["branch_available_qty", "branchAvailableQty"]) ?? onHand
      : numberValue(row, ["available_qty", "quantity_available", "qty_available"]) ?? onHand;
    const minimum = branchScoped
      ? numberValue(row, ["branch_min_stock", "branchMinStock"])
      : numberValue(row, ["min_stock"]);
    let status: InventoryAvailability["status"] = "unknown";
    if (available !== undefined) {
      status = available <= 0
        ? "out_of_stock"
        : minimum !== undefined && available <= minimum
          ? "low_stock"
          : "in_stock";
    }
    return {
      productId,
      branchId,
      status,
      quantityOnHand: onHand,
      quantityAvailable: available,
      externalRefs: [{ providerId: context.providerId, externalId: productId, externalType: "inventory" }],
      metadata: { source: "total-tools-pos" },
    };
  };

  return {
    async healthCheck(context): Promise<PlatformApiResult<PosAdapterHealthStatus>> {
      const result = await request<unknown>(context, "/api/products", { page: 1, limit: 1 });
      return result.success
        ? {
            success: true,
            data: {
              providerId: context.providerId,
              businessAccountId: context.businessAccountId,
              connected: true,
              checkedAt: new Date().toISOString(),
              displayName: "Total Tools POS",
              capabilities: {
                branches: true,
                categories: true,
                products: true,
                inventory: true,
                pricing: true,
                customers: false,
                orders: false,
                invoices: false,
                rentals: false,
                repairs: false,
                commercialQuotes: false,
              },
            },
            requestId: context.requestId,
          }
        : result;
    },

    async listBranches(context) {
      const result = await request<unknown>(context, "/api/branches");
      if (!result.success) return result;
      return {
        ...result,
        data: rowsFromPayload(result.data).map((row) => mapBranch(context, row)).filter(Boolean) as Branch[],
      };
    },

    async listCategories(context) {
      const result = await request<unknown>(context, "/api/categories");
      if (!result.success) return result;
      const rows = rowsFromPayload(result.data);
      const items = rows.map((row) => mapCategory(context, row)).filter(Boolean) as ProductCategory[];
      return { ...result, data: pageFromRows(items, result.data) };
    },

    async searchProducts(context, query?: ProductSearchQuery) {
      const result = await request<unknown>(context, "/api/products", {
        search: query?.search,
        category_id: query?.categoryId,
        branch_id: query?.branchId,
        sku: query?.sku,
        barcode: query?.barcode,
        page: query?.page,
        limit: query?.pageSize,
      });
      if (!result.success) return result;
      const rows = rowsFromPayload(result.data);
      const items = rows.map((row) => mapProduct(context, row, query?.branchId)).filter(Boolean) as CommerceProduct[];
      return { ...result, data: pageFromRows(items, result.data) };
    },

    async getProductById(context, productId: PlatformEntityId) {
      const direct = await request<unknown>(context, `/api/products/${encodeURIComponent(productId)}`);
      if (direct.success) {
        const envelope = asRecord(direct.data);
        const row = asRecord(envelope?.product) ||
          asRecord(envelope?.data) ||
          (envelope && textValue(envelope, ["id", "product_id", "productId"]) ? envelope : undefined) ||
          rowsFromPayload(direct.data)[0];
        // URL identity is authoritative. A valid-looking but mismatched product
        // must never be returned as another product's catalogue detail.
        if (!row || textValue(row, ["id", "product_id", "productId"]) !== productId) {
          return {
            success: false,
            error: { code: "PRODUCT_ID_MISMATCH", message: "POS returned an unverified product identity." },
            requestId: context.requestId,
          };
        }
        const product = mapProduct(context, row);
        if (product) return { ...direct, data: product };
        return {
          success: false,
          error: { code: "INVALID_PRODUCT_RESPONSE", message: "POS returned an incomplete product." },
          requestId: context.requestId,
        };
      }

      // Do not turn a POS authorization, rate-limit or network failure into a
      // second fuzzy search. Only a genuine not-found can use the exact-ID
      // compatibility lookup below.
      if (direct.error.code !== "TOTAL_TOOLS_POS_HTTP_404") return direct;
      const fallback = await request<unknown>(context, "/api/products", { search: productId });
      if (!fallback.success) return fallback;
      const row = rowsFromPayload(fallback.data).find((candidate) =>
        textValue(candidate, ["id", "product_id", "productId"]) === productId
      );
      const product = row ? mapProduct(context, row) : undefined;
      return product
        ? { ...fallback, data: product }
        : {
            success: false,
            error: { code: "PRODUCT_NOT_FOUND", message: `Product ${productId} was not returned by the Total Tools POS.` },
            requestId: context.requestId,
          };
    },

    async getInventoryAvailability(context, query: InventoryAvailabilityQuery) {
      const result = await request<unknown>(
        context,
        `/api/products/${encodeURIComponent(query.productId)}`,
        { branch_id: query.branchId }
      );
      if (!result.success) return result;
      const envelope = asRecord(result.data);
      const row = asRecord(envelope?.product) ||
        asRecord(envelope?.data) ||
        (envelope && textValue(envelope, ["id", "product_id", "productId"]) ? envelope : undefined) ||
        rowsFromPayload(result.data)[0];
      // Direct URL lookups are only trusted if the returned identity agrees.
      // An ignored branch_id parameter must not let another branch's data through.
      const responseProductId = row && textValue(row, ["id", "product_id", "productId"]);
      if (!row || responseProductId !== query.productId) {
        return {
          success: false,
          error: { code: "INVENTORY_PRODUCT_NOT_FOUND", message: `Product ${query.productId} was not returned for the requested branch.` },
          requestId: context.requestId,
        };
      }
      const responseBranchId = textValue(row, ["branch_id", "branchId"]);
      if (query.branchId && responseBranchId && responseBranchId !== query.branchId) {
        return {
          success: false,
          error: { code: "INVENTORY_BRANCH_MISMATCH", message: "POS returned inventory for a different branch." },
          requestId: context.requestId,
        };
      }
      return {
        ...result,
        data: [inventoryFromProduct(context, row, query.productId, query.branchId)],
      };
    },

    listRentalAssets: async (_context: PosAdapterContext, _query?: RentalAssetQuery): Promise<PlatformApiResult<PlatformPage<RentalAsset>>> => unsupported("Rental asset listing"),
    getRentalAssetById: async (): Promise<PlatformApiResult<RentalAsset>> => unsupported("Rental asset lookup"),
    getRentalAvailability: async (_context: PosAdapterContext, _query: RentalAvailabilityQuery): Promise<PlatformApiResult<InventoryAvailability[]>> => unsupported("Rental availability"),
    createRentalReservation: async (_context: PosAdapterContext, _request: RentalReservationRequest): Promise<PlatformApiResult<RentalReservationResult>> => unsupported("Rental reservation creation"),
    createRepairRequest: async (_context: PosAdapterContext, _request: RepairRequest): Promise<PlatformApiResult<RepairJob>> => unsupported("Repair request creation"),
    getRepairJobById: async (): Promise<PlatformApiResult<RepairJob>> => unsupported("Repair job lookup"),
    createCommercialQuote: async (_context: PosAdapterContext, _request: CommercialQuoteRequest): Promise<PlatformApiResult<CommercialQuoteResult>> => unsupported("Commercial quote creation"),
    createCustomer: async (_context: PosAdapterContext, _customer: CustomerAccount): Promise<PlatformApiResult<CustomerAccount>> => unsupported("Customer creation"),
    getCustomerById: async (): Promise<PlatformApiResult<CustomerAccount>> => unsupported("Customer lookup"),
    createOrder: async (_context: PosAdapterContext, _order: PlatformOrder): Promise<PlatformApiResult<PlatformOrder>> => unsupported("Order creation"),
    getOrderById: async (): Promise<PlatformApiResult<PlatformOrder>> => unsupported("Order lookup"),
    createInvoice: async (_context: PosAdapterContext, _invoice: PlatformInvoice): Promise<PlatformApiResult<PlatformInvoice>> => unsupported("Invoice creation"),
    handleWebhook: async (_context: PosAdapterContext, _event: PlatformWebhookEvent): Promise<PlatformApiResult<PlatformSyncResult>> => unsupported("Webhook handling"),
  };
}
