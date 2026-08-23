import type { CheckoutDeliveryAddress } from "./checkoutFulfilmentClient";

export type SavedDeliveryAddress = CheckoutDeliveryAddress & {
  id: string;
  label?: string;
  isDefault: boolean;
  zoneStatus?: string | null;
  zoneClass?: "metro" | "regular" | "rural" | "remote" | null;
  zoneSource?: string | null;
};

type ErrorPayload = { error?: { code?: string; message?: string } };

async function request<T>(body?: unknown) {
  const response = await fetch("/api/customer-addresses", {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    headers: body ? { Accept: "application/json", "Content-Type": "application/json" } : { Accept: "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({})) as T & ErrorPayload;
  if (!response.ok) {
    const error = new Error(payload.error?.message || "Saved addresses are unavailable.") as Error & { code?: string; status?: number };
    error.code = payload.error?.code;
    error.status = response.status;
    throw error;
  }
  return payload as T;
}

export async function listSavedDeliveryAddresses() {
  return request<{ addresses: SavedDeliveryAddress[] }>();
}

export async function saveDeliveryAddress(address: CheckoutDeliveryAddress & { id?: string; label?: string; isDefault?: boolean }) {
  return request<{ address: SavedDeliveryAddress; zone: any }>({ action: "save", address });
}

export async function deleteDeliveryAddress(id: string) {
  return request<{ id: string }>({ action: "delete", id });
}

export async function setDefaultDeliveryAddress(id: string) {
  return request<{ address: SavedDeliveryAddress }>({ action: "set_default", id });
}
