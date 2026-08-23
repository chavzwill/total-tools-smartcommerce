export type StaffSessionSummary = {
  employeeId: string;
  username: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  securityGroupName?: string;
};

export type DeliveryReview = {
  id: string;
  quote_id: string;
  customer_id: string;
  status: string;
  reason_code?: string | null;
  reason_message?: string | null;
  requested_service_id?: string | null;
  requested_speed?: string | null;
  destination_class?: string | null;
  address?: any;
  items?: any[];
  provider_name?: string | null;
  vehicle_class?: string | null;
  provider_cost_minor?: number | string | null;
  operations_markup_minor?: number | string | null;
  customer_charge_minor?: number | string | null;
  currency?: string;
  scheduled_for?: string | null;
  staff_notes?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at?: string;
};

type ApiError = { error?: { code?: string; message?: string } };

async function json<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as T & ApiError;
  if (!response.ok) {
    const error = new Error(payload.error?.message || "Request failed.") as Error & { status?: number; code?: string };
    error.status = response.status;
    error.code = payload.error?.code;
    throw error;
  }
  return payload;
}

export async function getStaffSession() {
  const response = await fetch("/api/staff-session", { credentials: "same-origin", headers: { Accept: "application/json" } });
  return json<{ authenticated: boolean; staff: StaffSessionSummary | null }>(response);
}

export async function loginStaff(input: { username: string; password?: string; pin?: string }) {
  const response = await fetch("/api/staff-session", {
    method: "POST",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ action: "login", ...input }),
  });
  return json<{ authenticated: boolean; staff: StaffSessionSummary }>(response);
}

export async function logoutStaff() {
  const response = await fetch("/api/staff-session", {
    method: "POST",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ action: "logout" }),
  });
  return json<{ authenticated: boolean; staff: null }>(response);
}

export async function listDeliveryReviews(status = "pending") {
  const response = await fetch(`/api/delivery-reviews?status=${encodeURIComponent(status)}`, { credentials: "same-origin", headers: { Accept: "application/json" } });
  return json<{ reviews: DeliveryReview[]; staff: StaffSessionSummary }>(response);
}

export async function priceDeliveryReview(input: {
  id: string;
  providerName?: string;
  vehicleClass?: string;
  providerCostMinor: number;
  customerChargeMinor: number;
  currency?: string;
  scheduledFor?: string;
  staffNotes?: string;
}) {
  const response = await fetch("/api/delivery-reviews", {
    method: "POST",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ action: "price", ...input }),
  });
  return json<{ review: DeliveryReview }>(response);
}
