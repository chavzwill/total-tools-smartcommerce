export type CustomerRental = {
  id: string;
  provider_reservation_id: string;
  rental_asset_id: string;
  equipment_name: string;
  branch?: string | null;
  start_at: string;
  end_at: string;
  status: string;
  fulfillment?: string | null;
  add_ons?: unknown[];
  extension_of_reservation_id?: string | null;
  daysRemaining: number;
  reminderLevel: "none" | "upcoming" | "due_soon" | "urgent" | "overdue";
};

type RentalListResponse = { rentals: CustomerRental[]; dueSoon: CustomerRental[]; error?: { message?: string } };

async function parse<T>(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || "Rental request failed.") as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return payload as T;
}

export async function listCustomerRentals() {
  const response = await fetch("/api/customer-rentals", { credentials: "same-origin", headers: { Accept: "application/json" } });
  return parse<RentalListResponse>(response);
}

export async function trackCustomerRental(input: {
  customerId: string;
  providerReservationId: string;
  rentalAssetId: string;
  equipmentName: string;
  branch?: string;
  startAt: string;
  endAt: string;
  status: string;
  fulfillment?: string;
  addOns?: unknown[];
  extensionOfReservationId?: string;
}) {
  const response = await fetch("/api/customer-rentals", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input),
  });
  return parse<{ rental: unknown }>(response);
}

export function extensionHref(rental: CustomerRental) {
  const nextStart = new Date(rental.end_at);
  nextStart.setUTCDate(nextStart.getUTCDate() + 1);
  const params = new URLSearchParams({
    extensionOf: rental.provider_reservation_id,
    start: nextStart.toISOString().slice(0, 10),
    branch: rental.branch || "",
    fulfillment: rental.fulfillment || "pickup",
  });
  return `#/rental/${encodeURIComponent(rental.rental_asset_id)}?${params.toString()}`;
}
