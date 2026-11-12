import type { CommerceProduct, InventoryAvailability } from "../platform";

// Reuse only authoritative branch inventory included in the POS catalogue
// response. A missing/mismatched quantity is unknown, not zero or global stock.
// Other providers continue using their own direct availability endpoints.
export function availabilityFromPosCatalogueSnapshot(
  product: CommerceProduct,
  requestedBranchId: string,
): InventoryAvailability[] | undefined {
  const metadata = product.metadata;
  if (!product.active ||
      !requestedBranchId ||
      metadata?.source !== "total-tools-pos" ||
      metadata.branchStockId !== requestedBranchId ||
      typeof metadata.branchStockQty !== "number" ||
      !Number.isFinite(metadata.branchStockQty)) {
    return undefined;
  }

  const onHand = metadata.branchStockQty;
  const minimum = typeof metadata.branchMinStock === "number" &&
    Number.isFinite(metadata.branchMinStock) ? metadata.branchMinStock : undefined;
  const status: InventoryAvailability["status"] = onHand <= 0
    ? "out_of_stock"
    : minimum !== undefined && onHand <= minimum
      ? "low_stock"
      : "in_stock";

  return [{
    productId: String(product.id),
    branchId: requestedBranchId,
    status,
    quantityOnHand: onHand,
    // Stock is POS-listed on-hand, not a checkout reservation.
    quantityAvailable: Math.max(0, onHand),
    metadata: { source: "total-tools-pos", liveVerified: true },
  }];
}
