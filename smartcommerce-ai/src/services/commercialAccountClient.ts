export type CommercialAccountSummary = {
  id: string;
  display_name: string;
  legal_name?: string | null;
  account_type: string;
  tax_identifier?: string | null;
  status: string;
  role: string;
  mapping_status?: string | null;
  provider_id?: string | null;
  provider_account_id?: string | null;
  provider_price_list_id?: string | null;
  payment_terms_code?: string | null;
};

export type CommercialAccountDetails = {
  account: {
    id: string;
    display_name: string;
    legal_name?: string | null;
    account_type: string;
    tax_identifier?: string | null;
    status: string;
  };
  role: string;
  sites: Array<{ id: string; name: string; city?: string | null; region?: string | null; line1?: string | null }>;
  projects: Array<{ id: string; site_id?: string | null; name: string; reference_code?: string | null; description?: string | null; status: string }>;
  approvalRules: Array<{ id: string; rule_type: string; currency?: string | null; threshold_minor?: number | string | null; threshold_days?: number | null; approver_role: string }>;
  members: Array<{ id: string; customer_id: string; role: string; status: string; full_name: string; email: string }>;
};

type ApiError = { error?: { code?: string; message?: string } };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  const payload = await response.json().catch(() => ({})) as T & ApiError;
  if (!response.ok) {
    const error = new Error(payload.error?.message || "Commercial account request failed.") as Error & { code?: string; status?: number };
    error.code = payload.error?.code;
    error.status = response.status;
    throw error;
  }
  return payload;
}

export async function listCommercialAccounts() {
  return request<{ accounts: CommercialAccountSummary[] }>("/api/commercial-account");
}

export async function getCommercialAccount(accountId: string) {
  return request<{ details: CommercialAccountDetails }>(`/api/commercial-account?accountId=${encodeURIComponent(accountId)}`);
}

export async function createCommercialAccount(input: { displayName: string; legalName?: string; taxIdentifier?: string; accountType: string }) {
  return request<{ details: CommercialAccountDetails }>("/api/commercial-account", {
    method: "POST",
    body: JSON.stringify({ action: "create_account", ...input }),
  });
}

export async function createCommercialSite(input: { accountId: string; name: string; line1?: string; city?: string; region?: string; contactName?: string; contactPhone?: string }) {
  return request<{ details: CommercialAccountDetails }>("/api/commercial-account", {
    method: "POST",
    body: JSON.stringify({ action: "create_site", ...input }),
  });
}

export async function createCommercialProject(input: { accountId: string; name: string; siteId?: string; referenceCode?: string; description?: string }) {
  return request<{ details: CommercialAccountDetails }>("/api/commercial-account", {
    method: "POST",
    body: JSON.stringify({ action: "create_project", ...input }),
  });
}
