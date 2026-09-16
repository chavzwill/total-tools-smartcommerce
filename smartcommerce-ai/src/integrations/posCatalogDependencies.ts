import type { PosCommerceSyncEnvelope, PosCommerceSyncEntityType } from "./posCommerceSyncContract.js";

export type PosCatalogDependency = {
  entityType: PosCommerceSyncEntityType;
  entityId: string;
};

const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const textList = (value: unknown) => Array.isArray(value)
  ? value.map(text).filter((item): item is string => Boolean(item))
  : [];

const push = (target: PosCatalogDependency[], entityType: PosCommerceSyncEntityType, entityId?: string) => {
  if (!entityId) return;
  if (!target.some((item) => item.entityType === entityType && item.entityId === entityId)) {
    target.push({ entityType, entityId });
  }
};

export function extractPosCatalogDependencies(event: PosCommerceSyncEnvelope): PosCatalogDependency[] {
  const payload = event.payload;
  const dependencies: PosCatalogDependency[] = [];

  if (event.entityType === "category") {
    const parentId = text(payload.parentId);
    if (parentId) {
      const dependency = { entityType: "category" as const, entityId: parentId };
      push(dependencies, dependency.entityType, dependency.entityId);
    }
  }

  if (event.entityType === "product") {
    const brandId = text(payload.brandId);
    if (brandId) {
      const dependency = { entityType: "brand" as const, entityId: brandId };
      push(dependencies, dependency.entityType, dependency.entityId);
    }
    const categoryIds = textList(payload.categoryIds);
    for (const categoryId of categoryIds) {
      const dependency = { entityType: "category" as const, entityId: categoryId };
      push(dependencies, dependency.entityType, dependency.entityId);
    }
  }
  if (event.entityType === "product_variation") {
    push(dependencies, "product", text(payload.productId));
  }

  if (event.entityType === "media") {
    const ownerType = text(payload.ownerType) as PosCommerceSyncEntityType | undefined;
    const ownerId = text(payload.ownerId);
    if (ownerType && ["brand", "category", "product", "product_variation", "promotion"].includes(ownerType)) {
      push(dependencies, ownerType, ownerId);
    }
  }

  if (event.entityType === "price" || event.entityType === "availability") {
    const variationId = text(payload.variationId);
    if (variationId) push(dependencies, "product_variation", variationId);
    else push(dependencies, "product", text(payload.productId));
  }

  if (event.entityType === "promotion") {
    for (const productId of textList(payload.productIds)) push(dependencies, "product", productId);
    for (const categoryId of textList(payload.categoryIds)) push(dependencies, "category", categoryId);
    for (const brandId of textList(payload.brandIds)) push(dependencies, "brand", brandId);
  }

  return dependencies;
}
