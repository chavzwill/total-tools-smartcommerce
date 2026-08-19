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

type SecurityResponse = {
  ok: boolean;
  message?: string;
  verified?: boolean;
  passwordReset?: boolean;
  alreadyVerified?: boolean;
};

export const CUSTOMER_ACCOUNT_CHANGED_EVENT = "smartcommerce:account-changed";
const RENTAL_DRAFT_KEY = "smartcommerce_rental_draft_v1";

function announceAccountChange(state: CustomerAccountState) {
  window.dispatchEvent(new CustomEvent(CUSTOMER_ACCOUNT_CHANGED_EVENT, { detail: state }));
}

function continueAccountIntent(state: CustomerAccountState) {
  if (!state.customer || typeof window === "undefined") return;

  const raw = window.location.hash.slice(1);
  const [path, queryString = ""] = raw.split("?");
  if (path !== "/account") return;

  const intent = new URLSearchParams(queryString).get("intent");
  if (intent === "repair") {
    window.location.hash = "/repairs";
    return;
  }

  if (intent === "rental") {
    let rentalId = "";
    try {
      const parsed = JSON.parse(window.localStorage.getItem(RENTAL_DRAFT_KEY) || "null");
      rentalId = typeof parsed?.rentalId === "string" ? parsed.rentalId : "";
    } catch {
      rentalId = "";
    }
    window.location.hash = rentalId ? `/rental/${encodeURIComponent(rentalId)}` : "/rentals";
    return;
  }

  if (intent === "checkout") {
    window.location.hash = "/checkout";
    return;
  }

  if (intent === "cart") {
    window.location.hash = "/cart";
    return;
  }

  if (intent === "commercial") {
    window.location.hash = "/commercial";
  }
}

async function readResponse(response: Response) {
  const payload = (await response.json()) as CustomerAccountState & AccountErrorPayload;
  if (!response.ok) {
    throw new Error(payload.error?.message || "Customer account request failed.");
  }
  return payload as CustomerAccountState;
}

async function readSecurityResponse(response: Response) {
  const payload = (await response.json()) as SecurityResponse & AccountErrorPayload;
  if (!response.ok) {
    throw new Error(payload.error?.message || "Account security request failed.");
  }
  return payload as SecurityResponse;
}

async function postSecurity(body: Record<string, unknown>) {
  const response = await fetch("/api/account-security", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return readSecurityResponse(response);
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
  continueAccountIntent(state);
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
  continueAccountIntent(state);
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

export function requestEmailVerification() {
  return postSecurity({ action: "request_verification" });
}

export function verifyCustomerEmail(token: string) {
  return postSecurity({ action: "verify_email", token });
}

export function requestPasswordReset(email: string) {
  return postSecurity({ action: "request_password_reset", email });
}

export function resetCustomerPassword(token: string, password: string) {
  return postSecurity({ action: "reset_password", token, password });
}
