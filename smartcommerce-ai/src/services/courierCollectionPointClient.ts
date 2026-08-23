export type CourierCollectionPoint = {
  id: string;
  provider: "tara" | "knutsford";
  name: string;
  town: string;
  parish: string;
  address: string;
  serviceIds: string[];
  sourceStatus: "published_current";
};

type ApiError = Error & { code?: string; status?: number };

export async function getCourierCollectionPoints(serviceId: string) {
  const response = await fetch(`/api/delivery-collection-points?serviceId=${encodeURIComponent(serviceId)}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  const payload = await response.json().catch(() => ({})) as { points?: CourierCollectionPoint[]; error?: { code?: string; message?: string } };
  if (!response.ok) {
    const error = new Error(payload.error?.message || "Courier collection points could not be loaded.") as ApiError;
    error.code = payload.error?.code;
    error.status = response.status;
    throw error;
  }
  return payload.points || [];
}
