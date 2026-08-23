type GuardInput = {
  baseUrl: string;
  headers: Record<string, string>;
  requestFetch: typeof fetch;
  resource: string;
  method: string;
  segments: string[];
  jsonBody: Record<string, unknown> | null;
};

type GuardResult = { code: string; message: string } | null;

async function readEntity(input: GuardInput, resource: string, id: string) {
  const url = new URL(`${input.baseUrl}/api/${resource}/${encodeURIComponent(id)}`);
  const response = await input.requestFetch(url, { method: "GET", headers: { ...input.headers, "Content-Type": "application/json" } });
  if (!response.ok) return null;
  return await response.json() as Record<string, any>;
}

function transitionAllowed(current: string, next: string, allowed: Record<string, string[]>) {
  return Boolean(current && next && allowed[current]?.includes(next));
}

export async function validateOperationsState(input: GuardInput): Promise<GuardResult> {
  const { resource, method, segments, jsonBody } = input;
  if (method !== "PATCH" && method !== "POST" && method !== "PUT") return null;

  if (resource === "purchase-requests" && method === "PATCH" && segments[2] === "status" && segments[1]) {
    const current = await readEntity(input, "purchase-requests", segments[1]);
    if (!current) return { code: "PR_STATE_UNAVAILABLE", message: "The purchase request state could not be verified. No change was sent." };
    const next = String(jsonBody?.status || "");
    const allowed: Record<string, string[]> = {
      draft: ["submitted"],
      submitted: ["approved", "rejected", "draft"],
      rejected: ["draft"],
      approved: [],
      converted: [],
      received: [],
    };
    if (!transitionAllowed(String(current.status), next, allowed)) return { code: "INVALID_PR_STATE_TRANSITION", message: `Purchase request ${current.pr_number || segments[1]} cannot move from ${current.status} to ${next}.` };
  }

  if (resource === "purchase-orders" && segments[1]) {
    const current = await readEntity(input, "purchase-orders", segments[1]);
    if (!current) return { code: "PO_STATE_UNAVAILABLE", message: "The purchase order state could not be verified. No change was sent." };

    if (method === "PATCH" && segments[2] === "status") {
      const next = String(jsonBody?.status || "");
      const allowed: Record<string, string[]> = {
        draft: ["sent", "cancelled"],
        sent: ["draft", "approved", "cancelled"],
        approved: ["cancelled"],
        partial: ["cancelled"],
        cancelled: [],
        received: [],
      };
      if (!transitionAllowed(String(current.status), next, allowed)) return { code: "INVALID_PO_STATE_TRANSITION", message: `Purchase order ${current.po_number || segments[1]} cannot move from ${current.status} to ${next}.` };
    }

    if (method === "PATCH" && segments[2] === "receive") {
      if (!["approved", "partial"].includes(String(current.status))) return { code: "PO_NOT_RECEIVABLE", message: `Purchase order ${current.po_number || segments[1]} must be approved before receiving.` };
      const requested = Array.isArray(jsonBody?.items) ? jsonBody!.items as Array<Record<string, unknown>> : [];
      const poItems = Array.isArray(current.items) ? current.items as Array<Record<string, any>> : [];
      let positiveLines = 0;
      for (const line of requested) {
        const itemId = String(line.item_id || "");
        const qty = Number(line.quantity_received);
        if (!itemId || !Number.isInteger(qty) || qty <= 0) continue;
        positiveLines += 1;
        const item = poItems.find((candidate) => String(candidate.id) === itemId);
        if (!item) return { code: "PO_RECEIVE_ITEM_MISMATCH", message: "One or more receiving lines do not belong to this purchase order." };
        const remaining = Number(item.quantity_ordered || 0) - Number(item.quantity_received || 0);
        if (qty > remaining) return { code: "PO_OVER_RECEIPT_BLOCKED", message: `${item.product_name || item.sku || "PO item"} has only ${remaining} remaining to receive.` };
      }
      if (positiveLines === 0) return { code: "PO_RECEIVE_QUANTITY_REQUIRED", message: "Enter at least one positive whole-number quantity to receive." };
    }
  }

  if (resource === "transfers" && segments[1]) {
    const current = await readEntity(input, "transfers", segments[1]);
    if (!current) return { code: "TRANSFER_STATE_UNAVAILABLE", message: "The transfer state could not be verified. No change was sent." };
    const status = String(current.status || "");

    if (method === "PATCH" && ["dispatch", "pickup"].includes(String(segments[2] || "")) && status !== "pending") {
      return { code: "TRANSFER_NOT_DISPATCHABLE", message: `Transfer ${current.transfer_number || segments[1]} can only be dispatched while pending.` };
    }
    if (method === "PATCH" && ["receive", "dropoff"].includes(String(segments[2] || ""))) {
      if (status !== "in_transit") return { code: "TRANSFER_NOT_RECEIVABLE", message: `Transfer ${current.transfer_number || segments[1]} must be in transit before receiving.` };
      const requested = Array.isArray(jsonBody?.items) ? jsonBody!.items as Array<Record<string, unknown>> : [];
      const transferItems = Array.isArray(current.items) ? current.items as Array<Record<string, any>> : [];
      for (const line of requested) {
        const itemId = String(line.item_id || "");
        const qty = Number(line.quantity_received);
        if (!itemId || !Number.isInteger(qty) || qty <= 0) continue;
        const item = transferItems.find((candidate) => String(candidate.id) === itemId);
        if (!item) return { code: "TRANSFER_RECEIVE_ITEM_MISMATCH", message: "One or more receiving lines do not belong to this transfer." };
        const remaining = Number(item.quantity_requested || 0) - Number(item.quantity_received || 0);
        if (qty > remaining) return { code: "TRANSFER_OVER_RECEIPT_BLOCKED", message: `${item.product_name || item.sku || "Transfer item"} has only ${remaining} remaining to receive.` };
      }
    }
    if (method === "PATCH" && segments[2] === "cancel" && !["pending", "in_transit"].includes(status)) {
      return { code: "TRANSFER_NOT_CANCELLABLE", message: `Transfer ${current.transfer_number || segments[1]} cannot be cancelled from ${status}.` };
    }
  }

  return null;
}
