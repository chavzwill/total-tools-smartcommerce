import { neon } from "@neondatabase/serverless";
import { handlePlatformRestRequest } from "../backend/platformRestApi.js";
import { createConfiguredTotalToolsPlatformService } from "../integrations/totalToolsPlatformRuntime.js";

let sqlClient: ReturnType<typeof neon> | undefined;
const platformService = createConfiguredTotalToolsPlatformService();

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("COMMERCE_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

function trustedHeaders() {
  const headers = new Headers({ Accept: "application/json" });
  const businessAccountId = process.env.SMARTCOMMERCE_BUSINESS_ACCOUNT_ID?.trim();
  const providerId = process.env.SMARTCOMMERCE_PROVIDER_ID?.trim();
  if (businessAccountId) headers.set("x-business-account-id", businessAccountId);
  if (providerId) headers.set("x-provider-id", providerId);
  return headers;
}

function configuredInventoryBranchId() {
  return (
    process.env.SMARTCOMMERCE_TOTAL_TOOLS_DEFAULT_BRANCH_ID?.trim() ||
    process.env.SMARTCOMMERCE_FULFILMENT_BRANCH_ID?.trim() ||
    undefined
  );
}

type CartRow = { provider_item_id: string; quantity: number; item_type: string };
export type CartInventoryLine = {
  productId: string;
  requestedQuantity: number;
  branchId: string | null;
  status: "verified" | "insufficient" | "out_of_stock" | "unknown" | "unsupported";
  quantityAvailable: number | null;
  quantityOnHand: number | null;
};

async function cartRows(customerId: string): Promise<CartRow[]> {
  return await sql()`
    SELECT ci.provider_item_id, ci.quantity, ci.item_type
    FROM customer_carts c
    JOIN customer_cart_items ci ON ci.cart_id = c.id
    WHERE c.customer_id = ${customerId}
      AND c.status = 'active'
    ORDER BY ci.created_at ASC
  ` as unknown as CartRow[];
}

async function checkLine(productId: string, quantity: number, branchId?: string): Promise<CartInventoryLine> {
  const url = new URL("https://smartcommerce.internal/api/platform/inventory/availability");
  url.searchParams.set("productId", productId);
  url.searchParams.set("quantity", String(quantity));
  if (branchId) url.searchParams.set("branchId", branchId);
  const response = await handlePlatformRestRequest(new Request(url, { headers: trustedHeaders() }), platformService);
  const payload = await response.json().catch(() => null) as any;
  if (!response.ok || !payload?.success || !Array.isArray(payload.data) || !payload.data[0]) {
    return { productId, requestedQuantity: quantity, branchId: branchId || null, status: "unknown", quantityAvailable: null, quantityOnHand: null };
  }
  const availability = payload.data[0];
  const available = Number.isFinite(Number(availability.quantityAvailable)) ? Number(availability.quantityAvailable) : null;
  const onHand = Number.isFinite(Number(availability.quantityOnHand)) ? Number(availability.quantityOnHand) : null;
  if (availability.status === "out_of_stock" || available === 0) {
    return { productId, requestedQuantity: quantity, branchId: branchId || null, status: "out_of_stock", quantityAvailable: available, quantityOnHand: onHand };
  }
  if (available !== null && available < quantity) {
    return { productId, requestedQuantity: quantity, branchId: branchId || null, status: "insufficient", quantityAvailable: available, quantityOnHand: onHand };
  }
  if (available !== null && available >= quantity) {
    return { productId, requestedQuantity: quantity, branchId: branchId || null, status: "verified", quantityAvailable: available, quantityOnHand: onHand };
  }
  return { productId, requestedQuantity: quantity, branchId: branchId || null, status: "unknown", quantityAvailable: available, quantityOnHand: onHand };
}

export async function validateCustomerCartInventory(customerId: string) {
  const rows = await cartRows(customerId);
  const branchId = configuredInventoryBranchId();
  const lines: CartInventoryLine[] = [];
  for (const row of rows) {
    if (row.item_type !== "product") {
      lines.push({ productId: row.provider_item_id, requestedQuantity: row.quantity, branchId: branchId || null, status: "unsupported", quantityAvailable: null, quantityOnHand: null });
      continue;
    }
    lines.push(await checkLine(row.provider_item_id, row.quantity, branchId));
  }
  const blocking = lines.filter((line) => line.status !== "verified");
  return {
    verified: lines.length > 0 && blocking.length === 0,
    branchId: branchId || null,
    branchConfigured: Boolean(branchId),
    lines,
    blocking,
    checkedAt: new Date().toISOString(),
  };
}
