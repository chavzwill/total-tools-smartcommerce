export type CustomerSession = {
  id: string;
  label: string;
  deviceFamily: string | null;
  browserFamily: string | null;
  authLevel: string;
  current: boolean;
  createdAt: string;
  lastActivityAt: string | null;
  expiresAt: string;
};

async function api<T>(input?: RequestInit): Promise<T> {
  const response = await fetch("/api/account-sessions", {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(input?.headers || {}) },
    ...input,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || "Session management is temporarily unavailable.");
  return payload as T;
}

export async function listCustomerSessions() {
  const result = await api<{ sessions: CustomerSession[] }>();
  return result.sessions;
}

export async function revokeCustomerSession(sessionId: string) {
  await api({ method: "POST", body: JSON.stringify({ action: "revoke", sessionId }) });
}

export async function revokeOtherCustomerSessions() {
  return api<{ ok: true; revoked: number }>({ method: "POST", body: JSON.stringify({ action: "revoke_others" }) });
}
