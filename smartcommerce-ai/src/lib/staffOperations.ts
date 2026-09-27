export type StaffIdentity = {
  employeeId: string;
  username: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  securityGroupName?: string;
  defaultBranchId?: string;
  defaultBranchName?: string;
  permissions: Record<string, boolean>;
};

export type StaffSessionState = {
  authenticated: boolean;
  staff: StaffIdentity | null;
};

export type OperationsApiError = Error & { status?: number; code?: string; details?: unknown };

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error?.message || "The operation could not be completed.") as OperationsApiError;
    error.status = response.status;
    error.code = payload?.error?.code;
    error.details = payload?.error?.details;
    throw error;
  }
  return payload as T;
}

export function getStaffSession() {
  return jsonRequest<StaffSessionState>("/api/staff-session");
}

export function loginStaff(input: { username: string; password?: string; pin?: string }) {
  return jsonRequest<StaffSessionState>("/api/staff-session", {
    method: "POST",
    body: JSON.stringify({ action: "login", ...input }),
  });
}

export function logoutStaff() {
  return jsonRequest<StaffSessionState>("/api/staff-session", {
    method: "POST",
    body: JSON.stringify({ action: "logout" }),
  });
}

export async function operationsRequest<T>(resourcePath: string, init?: RequestInit): Promise<T> {
  const normalized = resourcePath.replace(/^\/+/, "");
  return jsonRequest<T>(`/api/operations/${normalized}`, init);
}

export function listActiveWorkOrders() {
  return operationsRequest<any[]>("work-orders?view=active");
}

export function listAwaitingPaymentWorkOrders() {
  return operationsRequest<any[]>("work-orders?view=awaiting_payment");
}

export function listActiveTechnicianTasks() {
  return operationsRequest<any[]>("work-orders/active-tasks");
}

export function listTechnicianSchedule(date: string) {
  return operationsRequest<{ scheduled: any[]; unscheduled: any[] }>(`work-orders/schedule?date=${encodeURIComponent(date)}`);
}
