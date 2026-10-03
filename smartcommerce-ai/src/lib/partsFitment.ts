import type { Product } from "../types";

const BRAND_FIELDS = ["Brand", "Manufacturer", "Make"] as const;
const EQUIPMENT_TYPE_FIELDS = ["Equipment Type", "Machine Type", "Equipment Family", "Machine Family"] as const;
const MODEL_FIELDS = ["Model", "Equipment Model", "Machine Model"] as const;
const COMPATIBLE_MODEL_FIELDS = [
  "Compatible Models",
  "Compatible Model",
  "Fits Models",
  "Fits Model",
  "Equipment Models",
  "Machine Models",
  "Model Compatibility",
] as const;
const VARIANT_FIELDS = ["Model Variant", "Variant", "Revision", "Equipment Revision"] as const;
const ASSEMBLY_FIELDS = ["Assembly", "Assembly Group", "Parts Group", "Part Group", "System", "Component Group"] as const;
const PART_NUMBER_FIELDS = ["OEM Part Number", "Manufacturer Part Number", "Part Number", "MPN"] as const;
const PARENT_PART_FIELDS = ["Parent Part Number", "Parent OEM Part Number", "Parent Part", "Parent Component"] as const;
const REFERENCE_FIELDS = ["Diagram Reference", "Reference", "Position", "Illustration Reference"] as const;
const RECORD_TYPE_FIELDS = ["Item Type", "Product Type", "Record Type", "Catalog Type"] as const;

const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

const splitList = (value: string) =>
  value
    .split(/[\n,;|]+/)
    .map((item) => item.trim())
    .filter(Boolean);

function valuesFor(product: Product, aliases: readonly string[]) {
  const aliasKeys = new Set(aliases.map(normalize));
  return Object.entries(product.specs || {})
    .filter(([key, value]) => aliasKeys.has(normalize(key)) && String(value || "").trim())
    .map(([, value]) => String(value).trim());
}

function readFirst(product: Product, aliases: readonly string[]) {
  return valuesFor(product, aliases)[0] || "";
}

function readList(product: Product, aliases: readonly string[]) {
  return Array.from(new Set(valuesFor(product, aliases).flatMap(splitList)));
}

function fallbackEquipmentType(product: Product, partLike: boolean) {
  const candidates = [product.subcategory, product.category, product.department]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (!partLike) return candidates[0] || "Equipment";
  return candidates.find((value) => !/\b(parts?|spares?|components?)\b/i.test(value)) || "Equipment";
}

function isPartLike(product: Product) {
  const recordType = readFirst(product, RECORD_TYPE_FIELDS);
  const partNumber = readFirst(product, PART_NUMBER_FIELDS);
  const compatibleModels = readList(product, COMPATIBLE_MODEL_FIELDS);
  const tags = product.tags.map(normalize);
  return (
    /\b(part|spare|replacement|component|assembly)\b/i.test(recordType) ||
    Boolean(partNumber) ||
    compatibleModels.length > 0 ||
    /\b(parts?|spares?)\b/i.test(product.category) ||
    tags.some((tag) => tag === "part" || tag === "parts" || tag === "spare part" || tag === "replacement part")
  );
}

export type FitmentPart = {
  product: Product;
  partNumber: string;
  parentPartNumber?: string;
  assembly: string;
  reference?: string;
};

export type EquipmentModelFitment = {
  key: string;
  brand: string;
  equipmentType: string;
  model: string;
  variant?: string;
  machineProducts: Product[];
  parts: FitmentPart[];
};

export type BrandFitmentSummary = {
  brand: string;
  equipmentTypes: number;
  models: number;
  parts: number;
};

export type PartsFitmentIndex = {
  brands: BrandFitmentSummary[];
  models: EquipmentModelFitment[];
};

export type FitmentSearchHit =
  | {
      kind: "model";
      key: string;
      brand: string;
      equipmentType: string;
      model: string;
      variant?: string;
      label: string;
      detail: string;
    }
  | {
      kind: "part";
      key: string;
      brand: string;
      equipmentType: string;
      model: string;
      variant?: string;
      assembly: string;
      part: FitmentPart;
      label: string;
      detail: string;
    };

export type FitmentPartNode = {
  part: FitmentPart;
  children: FitmentPartNode[];
};

function modelKey(brand: string, equipmentType: string, model: string, variant = "") {
  return [brand, equipmentType, model, variant].map(normalize).join("::");
}

function partIdentity(part: FitmentPart) {
  return `${part.product.id}::${normalize(part.partNumber)}`;
}

export function buildPartsFitmentIndex(products: Product[]): PartsFitmentIndex {
  const models = new Map<string, EquipmentModelFitment>();

  const ensureModel = (brand: string, equipmentType: string, model: string, variant = "") => {
    const key = modelKey(brand, equipmentType, model, variant);
    const existing = models.get(key);
    if (existing) return existing;
    const created: EquipmentModelFitment = {
      key,
      brand,
      equipmentType,
      model,
      variant: variant || undefined,
      machineProducts: [],
      parts: [],
    };
    models.set(key, created);
    return created;
  };

  products.forEach((product) => {
    const brand = readFirst(product, BRAND_FIELDS);
    if (!brand) return;

    const partLike = isPartLike(product);
    const equipmentType =
      readFirst(product, EQUIPMENT_TYPE_FIELDS) || fallbackEquipmentType(product, partLike);
    const variant = readFirst(product, VARIANT_FIELDS);

    if (partLike) {
      const compatibleModels = readList(product, COMPATIBLE_MODEL_FIELDS);
      const explicitModel = readFirst(product, MODEL_FIELDS);
      const targetModels = compatibleModels.length ? compatibleModels : explicitModel ? [explicitModel] : [];
      if (!targetModels.length) return;

      const part: FitmentPart = {
        product,
        partNumber: readFirst(product, PART_NUMBER_FIELDS) || product.sku,
        parentPartNumber: readFirst(product, PARENT_PART_FIELDS) || undefined,
        assembly: readFirst(product, ASSEMBLY_FIELDS) || "Other parts",
        reference: readFirst(product, REFERENCE_FIELDS) || undefined,
      };

      targetModels.forEach((model) => {
        const fitment = ensureModel(brand, equipmentType, model, variant);
        if (!fitment.parts.some((candidate) => partIdentity(candidate) === partIdentity(part))) {
          fitment.parts.push(part);
        }
      });
      return;
    }

    const model = readFirst(product, MODEL_FIELDS);
    if (!model) return;
    const fitment = ensureModel(brand, equipmentType, model, variant);
    if (!fitment.machineProducts.some((candidate) => candidate.id === product.id)) {
      fitment.machineProducts.push(product);
    }
  });

  const modelList = Array.from(models.values())
    .map((fitment) => ({
      ...fitment,
      machineProducts: [...fitment.machineProducts].sort((a, b) => a.name.localeCompare(b.name)),
      parts: [...fitment.parts].sort((a, b) => {
        const assembly = a.assembly.localeCompare(b.assembly);
        if (assembly) return assembly;
        return a.product.name.localeCompare(b.product.name);
      }),
    }))
    .sort((a, b) =>
      a.brand.localeCompare(b.brand) ||
      a.equipmentType.localeCompare(b.equipmentType) ||
      a.model.localeCompare(b.model) ||
      String(a.variant || "").localeCompare(String(b.variant || ""))
    );

  const brandMap = new Map<string, { types: Set<string>; models: Set<string>; parts: Set<string> }>();
  modelList.forEach((fitment) => {
    const entry = brandMap.get(fitment.brand) || {
      types: new Set<string>(),
      models: new Set<string>(),
      parts: new Set<string>(),
    };
    entry.types.add(fitment.equipmentType);
    entry.models.add(fitment.key);
    fitment.parts.forEach((part) => entry.parts.add(partIdentity(part)));
    brandMap.set(fitment.brand, entry);
  });

  const brands = Array.from(brandMap.entries())
    .map(([brand, value]) => ({
      brand,
      equipmentTypes: value.types.size,
      models: value.models.size,
      parts: value.parts.size,
    }))
    .sort((a, b) => a.brand.localeCompare(b.brand));

  return { brands, models: modelList };
}

export function getAssemblies(fitment: EquipmentModelFitment) {
  const counts = new Map<string, number>();
  fitment.parts.forEach((part) => counts.set(part.assembly, (counts.get(part.assembly) || 0) + 1));
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function buildPartTree(parts: FitmentPart[]): FitmentPartNode[] {
  const byPartNumber = new Map<string, FitmentPart>();
  parts.forEach((part) => {
    const key = normalize(part.partNumber);
    if (key && !byPartNumber.has(key)) byPartNumber.set(key, part);
  });

  const childIds = new Set<string>();
  const children = new Map<string, FitmentPart[]>();
  parts.forEach((part) => {
    const parentKey = normalize(part.parentPartNumber || "");
    const parent = parentKey ? byPartNumber.get(parentKey) : undefined;
    if (!parent || partIdentity(parent) === partIdentity(part)) return;
    const parentId = partIdentity(parent);
    childIds.add(partIdentity(part));
    const list = children.get(parentId) || [];
    list.push(part);
    children.set(parentId, list);
  });

  const buildNode = (part: FitmentPart, ancestry = new Set<string>()): FitmentPartNode => {
    const id = partIdentity(part);
    if (ancestry.has(id)) return { part, children: [] };
    const nextAncestry = new Set(ancestry);
    nextAncestry.add(id);
    return {
      part,
      children: (children.get(id) || [])
        .sort((a, b) => a.product.name.localeCompare(b.product.name))
        .map((child) => buildNode(child, nextAncestry)),
    };
  };

  return parts
    .filter((part) => !childIds.has(partIdentity(part)))
    .sort((a, b) => a.product.name.localeCompare(b.product.name))
    .map((part) => buildNode(part));
}

export function searchPartsFitment(index: PartsFitmentIndex, query: string, limit = 24): FitmentSearchHit[] {
  const term = normalize(query);
  if (!term) return [];

  const hits: Array<FitmentSearchHit & { score: number }> = [];
  index.models.forEach((fitment) => {
    const modelText = normalize(
      `${fitment.brand} ${fitment.equipmentType} ${fitment.model} ${fitment.variant || ""}`
    );
    if (modelText.includes(term)) {
      const exactModel = normalize(fitment.model) === term;
      hits.push({
        kind: "model",
        key: `model:${fitment.key}`,
        brand: fitment.brand,
        equipmentType: fitment.equipmentType,
        model: fitment.model,
        variant: fitment.variant,
        label: fitment.variant ? `${fitment.model} · ${fitment.variant}` : fitment.model,
        detail: `${fitment.brand} · ${fitment.equipmentType} · ${fitment.parts.length} mapped part${fitment.parts.length === 1 ? "" : "s"}`,
        score: exactModel ? 0 : 3,
      });
    }

    fitment.parts.forEach((part) => {
      const partNumber = normalize(part.partNumber);
      const sku = normalize(part.product.sku);
      const partText = normalize(
        `${fitment.brand} ${fitment.equipmentType} ${fitment.model} ${fitment.variant || ""} ${part.assembly} ${part.product.name} ${part.partNumber} ${part.product.sku} ${part.reference || ""}`
      );
      if (!partText.includes(term)) return;
      const exactPart = partNumber === term || sku === term;
      hits.push({
        kind: "part",
        key: `part:${fitment.key}:${partIdentity(part)}`,
        brand: fitment.brand,
        equipmentType: fitment.equipmentType,
        model: fitment.model,
        variant: fitment.variant,
        assembly: part.assembly,
        part,
        label: part.product.name,
        detail: `${part.partNumber} · ${fitment.brand} ${fitment.model} · ${part.assembly}`,
        score: exactPart ? 0 : 2,
      });
    });
  });

  return hits
    .sort((a, b) => a.score - b.score || a.label.localeCompare(b.label))
    .slice(0, Math.max(1, limit))
    .map(({ score: _score, ...hit }) => hit);
}
