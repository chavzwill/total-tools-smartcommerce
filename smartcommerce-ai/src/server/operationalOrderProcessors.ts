import type { OperationalOutboxJob, OperationalOutboxProcessorResult } from "./operationalOrderOutboxWorker.js";

export function currentlyProcessableOperationalDestinations() {
  const destinations: OperationalOutboxJob["destination"][] = ["fulfilment_activation"];
  if (process.env.SMARTCOMMERCE_POS_ORDER_WRITE_ENABLED === "true") destinations.push("pos_order_write");
  if (process.env.SMARTCOMMERCE_PROVIDER_INVENTORY_COMMIT_ENABLED === "true") destinations.push("inventory_commitment");
  return destinations;
}

export async function processOperationalOutboxJob(job: OperationalOutboxJob): Promise<OperationalOutboxProcessorResult> {
  if (job.destination === "fulfilment_activation") {
    return { outcome: "acknowledged", externalReference: `smartcommerce:${job.tracking_reference || job.order_id}:fulfilment` };
  }

  if (job.destination === "pos_order_write") {
    if (process.env.SMARTCOMMERCE_POS_ORDER_WRITE_ENABLED !== "true") {
      return { outcome: "retry", errorCode: "pos_order_write_not_enabled", retryAfterSeconds: 3600 };
    }
    return { outcome: "retry", errorCode: "pos_order_write_adapter_not_connected", retryAfterSeconds: 900 };
  }

  if (job.destination === "inventory_commitment") {
    if (process.env.SMARTCOMMERCE_PROVIDER_INVENTORY_COMMIT_ENABLED !== "true") {
      return { outcome: "retry", errorCode: "provider_inventory_commit_not_enabled", retryAfterSeconds: 3600 };
    }
    return { outcome: "retry", errorCode: "provider_inventory_commit_adapter_not_connected", retryAfterSeconds: 900 };
  }

  return { outcome: "failed", errorCode: "unsupported_operational_destination" };
}
