export type MfaStatus = { totpEnabled: boolean; recoveryCodesRemaining: number };

async function api<T>(input?: RequestInit): Promise<T> {
  const response = await fetch("/api/account-mfa", {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(input?.headers || {}) },
    ...input,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || "Multi-factor authentication is temporarily unavailable.");
  return payload as T;
}

export function getMfaStatus() { return api<MfaStatus>(); }
export function beginTotpEnrollment() { return api<{ secret: string; otpauthUri: string }>({ method: "POST", body: JSON.stringify({ action: "totp_begin" }) }); }
export function confirmTotpEnrollment(code: string) { return api<{ ok: true; recoveryCodes: string[]; stepUpExpiresAt: string }>({ method: "POST", body: JSON.stringify({ action: "totp_confirm", code }) }); }
export function stepUpWithTotp(code: string) { return api<{ ok: true; stepUpExpiresAt: string }>({ method: "POST", body: JSON.stringify({ action: "totp_verify", code }) }); }
export function stepUpWithRecoveryCode(code: string) { return api<{ ok: true; stepUpExpiresAt: string }>({ method: "POST", body: JSON.stringify({ action: "recovery_verify", code }) }); }
export function disableTotp() { return api<{ ok: true }>({ method: "POST", body: JSON.stringify({ action: "disable_totp" }) }); }
