export type CustomerAccount = {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CustomerAccountState = {
  authenticated: boolean;
  customer: CustomerAccount | null;
};

type AccountErrorPayload = {
  error?: { code?: string; message?: string; retryable?: boolean };
};

export const CUSTOMER_ACCOUNT_CHANGED_EVENT = "smartcommerce:account-changed";

function announceAccountChange(state: CustomerAccountState) {
  window.dispatchEvent(new CustomEvent(CUSTOMER_ACCOUNT_CHANGED_EVENT, { detail: state }));
}

async function readResponse(response: Response) {
  const payload = (await response.json()) as CustomerAccountState & AccountErrorPayload;
  if (!response.ok) {
    throw new Error(payload.error?.message || "Customer account request failed.");
  }
  return payload as CustomerAccountState;
}

export async function getCustomerAccount() {
  const response = await fetch("/api/account", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  return readResponse(response);
}

export async function signUpCustomer(input: {
  fullName: string;
  email: string;
  phone?: string;
  password: string;
}) {
  const response = await fetch("/api/account", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ action: "signup", ...input }),
  });
  const state = await readResponse(response);
  announceAccountChange(state);
  return state;
}

export async function loginCustomer(input: { email: string; password: string }) {
  const response = await fetch("/api/account", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ action: "login", ...input }),
  });
  const state = await readResponse(response);
  announceAccountChange(state);
  return state;
}

export async function logoutCustomer() {
  const response = await fetch("/api/account", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ action: "logout" }),
  });
  const state = await readResponse(response);
  announceAccountChange(state);
  return state;
}
