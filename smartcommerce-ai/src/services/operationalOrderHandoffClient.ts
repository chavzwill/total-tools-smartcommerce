export type OperationalOrderHandoff = {
  id: string;
  payment_attempt_id: string;
  quote_id: string;
  subject_kind: "customer" | "guest";
  currency: string;
  amount_minor: number | string;
  fulfilment_mode: "pickup" | "delivery";
  fulfilment_status: string;
  tracking_reference: string;
  pos_handoff_status: "pending" | "processing" | "acknowledged" | "failed";
  pos_order_reference?: string | null;
  inventory_commitment_status: "committed_internal" | "provider_acknowledged" | "released";
  commitment_lines: number | string;
  pending_handoffs: number | string;
  created_at: string;
  updated_at: string;
};

export async function fetchOperationalOrderHandoffs() {
  const response = await fetch("/api/operational-order-handoffs", { credentials: "include", headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(payload?.error?.message || "Operational order handoffs are unavailable."), { status: response.status, code: payload?.error?.code });
  return payload as {
    summary: { total: number; pendingPos: number; pendingOperations: number; internalInventoryCommitments: number };
    orders: OperationalOrderHandoff[];
  };
}
