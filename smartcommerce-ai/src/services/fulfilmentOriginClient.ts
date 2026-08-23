export type FulfilmentOrigin = {
  id: string;
  branchId?: string | null;
  branchName?: string | null;
  town: string;
  parish: string;
  addressLine1?: string | null;
  active: boolean;
  source: "database" | "environment" | "unconfigured";
  updatedBy?: string | null;
  updatedAt?: string | null;
};

type OriginResponse = {
  origin: FulfilmentOrigin;
  canUpdate: boolean;
  error?: { code?: string; message?: string };
};

async function parse(response: Response) {
  const payload = await response.json().catch(() => ({})) as OriginResponse;
  if (!response.ok) {
    const error = new Error(payload.error?.message || "Fulfilment origin could not be loaded.") as Error & { code?: string; status?: number };
    error.code = payload.error?.code;
    error.status = response.status;
    throw error;
  }
  return payload;
}

export async function getFulfilmentOrigin() {
  return parse(await fetch("/api/fulfilment-origin", { credentials: "same-origin", headers: { Accept: "application/json" } }));
}

export async function updateFulfilmentOrigin(input: {
  branchId?: string;
  branchName?: string;
  town: string;
  parish: string;
  addressLine1?: string;
}) {
  return parse(await fetch("/api/fulfilment-origin", {
    method: "PUT",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }));
}
