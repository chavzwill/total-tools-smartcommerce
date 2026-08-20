import type { Branch, PlatformApiResult } from "../platform";
import type { ProductMatchResult } from "../types/productMatch";

const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const MAX_DIMENSION = 1600;
const SHOPPING_BRANCH_KEY = "smartcommerce_shopping_branch_v1";

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The selected image could not be read."));
    image.src = url;
  });
}

function savedShoppingBranch() {
  try {
    const value = window.localStorage.getItem(SHOPPING_BRANCH_KEY)?.trim();
    return value && value !== "Online" ? value : undefined;
  } catch {
    return undefined;
  }
}

async function resolveSelectedBranchId(explicitBranchId?: string) {
  if (explicitBranchId) return explicitBranchId;
  const selectedName = savedShoppingBranch();
  if (!selectedName) return import.meta.env.VITE_SMARTCOMMERCE_BRANCH_ID || undefined;

  try {
    const response = await fetch("/api/platform/branches", {
      headers: { Accept: "application/json" },
    });
    const payload = (await response.json()) as PlatformApiResult<Branch[]>;
    if (!response.ok || !payload.success) return undefined;
    return payload.data.find(
      (branch) => branch.active && branch.name.trim().toLowerCase() === selectedName.toLowerCase(),
    )?.id;
  } catch {
    return undefined;
  }
}

export async function prepareProductMatchImage(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file to use Product Match.");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("That image is too large. Choose a photo smaller than 15 MB.");

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const longest = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = longest > MAX_DIMENSION ? MAX_DIMENSION / longest : 1;
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the image.");
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function matchProductPhoto(imageDataUrl: string, branchId?: string): Promise<PlatformApiResult<ProductMatchResult>> {
  try {
    const resolvedBranchId = await resolveSelectedBranchId(branchId);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Request-Id": typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    };

    const response = await fetch("/api/product-match", {
      method: "POST",
      headers,
      body: JSON.stringify({ imageDataUrl, branchId: resolvedBranchId }),
    });
    const payload = (await response.json()) as PlatformApiResult<ProductMatchResult>;
    if (!response.ok && payload.success) return { success: false, error: { code: "PRODUCT_MATCH_HTTP_ERROR", message: `Product Match failed with HTTP ${response.status}.` } };
    return payload;
  } catch (error) {
    return { success: false, error: { code: "PRODUCT_MATCH_NETWORK_ERROR", message: error instanceof Error ? error.message : "Product Match could not reach the server." } };
  }
}
