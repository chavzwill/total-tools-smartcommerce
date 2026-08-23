export type ChannelTelemetryOptions = {
  sourceChannel?: "website" | "ios" | "android" | string;
  sourceApplication?: string;
  entityType?: string;
  entityId?: string;
  branchId?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

type SafeScalar = string | number | boolean | null;
type SafePayload = Record<string, SafeScalar>;

function detectedChannel() {
  if (typeof window === "undefined") return "website";
  const declared = String((window as any).__SMARTCOMMERCE_CHANNEL || document.documentElement.dataset.smartcommerceChannel || "").toLowerCase();
  return ["ios", "android", "website"].includes(declared) ? declared : "website";
}

function cleanPayload(payload: Record<string, unknown>): SafePayload {
  const safe: SafePayload = {};
  for (const [key, value] of Object.entries(payload).slice(0, 30)) {
    if (/password|token|secret|card|cvv|pin|email|phone|address|name|note|message|query|search/i.test(key)) continue;
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      const normalized = typeof value === "string" ? value.slice(0, 180) : value;
      safe[key] = normalized as SafeScalar;
    }
  }
  return safe;
}

export function logChannelEvent(eventType: string, payload: Record<string, unknown> = {}, options: ChannelTelemetryOptions = {}) {
  if (typeof window === "undefined" || !eventType) return;
  const body = JSON.stringify({
    kind: "event",
    sourceChannel: options.sourceChannel || detectedChannel(),
    sourceApplication: options.sourceApplication || "smartcommerce-customer",
    eventType,
    entityType: options.entityType,
    entityId: options.entityId,
    branchId: options.branchId,
    payload: cleanPayload(payload),
    metadata: options.metadata || {},
    occurredAt: new Date().toISOString(),
  });

  try {
    if (navigator.sendBeacon) {
      const accepted = navigator.sendBeacon("/api/omnichannel", new Blob([body], { type: "application/json" }));
      if (accepted) return;
    }
  } catch { /* fall through */ }

  void fetch("/api/omnichannel", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}
