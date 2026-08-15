import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";

export type CustomerPasskey = {
  id: string;
  label: string;
  deviceType?: string | null;
  backedUp?: boolean | null;
  transports?: string[];
};

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || "Security request failed.");
  }
  return payload as T;
}

export function passkeysSupported() {
  return browserSupportsWebAuthn();
}

export async function confirmSensitiveAction(password: string, purpose = "passkey_registration") {
  return post<{ ok: true; stepUp: { method: string; expiresAt: string } }>("/api/account-step-up", {
    password,
    purpose,
  });
}

export async function listCustomerPasskeys() {
  const result = await post<{ passkeys: CustomerPasskey[] }>("/api/account-passkeys", { action: "list" });
  return result.passkeys || [];
}

export async function registerCustomerPasskey(label = "Passkey") {
  if (!passkeysSupported()) throw new Error("Passkeys are not supported by this browser or device.");
  const start = await post<{ options: any }>("/api/account-passkeys", { action: "registration_options" });
  const credential = await startRegistration({ optionsJSON: start.options });
  return post<{ verified: true; authenticatorId: string }>("/api/account-passkeys", {
    action: "verify_registration",
    response: credential,
    label,
  });
}

export async function stepUpWithCustomerPasskey() {
  if (!passkeysSupported()) throw new Error("Passkeys are not supported by this browser or device.");
  const start = await post<{ options: any }>("/api/account-passkeys", { action: "authentication_options" });
  const credential = await startAuthentication({ optionsJSON: start.options });
  return post<{ verified: true; stepUpExpiresAt: string }>("/api/account-passkeys", {
    action: "verify_authentication",
    response: credential,
  });
}
