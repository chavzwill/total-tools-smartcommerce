import type { PlatformApiResult } from "../platform";
import type { ProductMatchResult } from "../types/productMatch";

const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const MAX_DIMENSION = 1600;

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The selected image could not be read."));
    image.src = url;
  });
}

export async function prepareProductMatchImage(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file to use Product Match.");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("That image is too large. Choose a photo smaller than 15 MB.");
  }

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

export async function matchProductPhoto(
  imageDataUrl: string,
  branchId?: string
): Promise<PlatformApiResult<ProductMatchResult>> {
  const businessAccountId = import.meta.env.VITE_SMARTCOMMERCE_BUSINESS_ID;
  const providerId = import.meta.env.VITE_SMARTCOMMERCE_PROVIDER_ID;

  if (!businessAccountId || !providerId) {
    return {
      success: false,
      error: {
        code: "PLATFORM_CONTEXT_REQUIRED",
        message: "Product Match requires a connected SmartCommerce provider.",
      },
    };
  }

  try {
    const response = await fetch("/api/product-match", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Business-Account-Id": businessAccountId,
        "X-Provider-Id": providerId,
        "X-Request-Id":
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      },
      body: JSON.stringify({
        imageDataUrl,
        branchId: branchId || import.meta.env.VITE_SMARTCOMMERCE_BRANCH_ID || undefined,
      }),
    });

    const payload = (await response.json()) as PlatformApiResult<ProductMatchResult>;
    if (!response.ok && payload.success) {
      return {
        success: false,
        error: {
          code: "PRODUCT_MATCH_HTTP_ERROR",
          message: `Product Match failed with HTTP ${response.status}.`,
        },
      };
    }
    return payload;
  } catch (error) {
    return {
      success: false,
      error: {
        code: "PRODUCT_MATCH_NETWORK_ERROR",
        message: error instanceof Error ? error.message : "Product Match could not reach the server.",
      },
    };
  }
}
