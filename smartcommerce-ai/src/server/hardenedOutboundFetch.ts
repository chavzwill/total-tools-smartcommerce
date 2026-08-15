const DEFAULT_TIMEOUT_MS = 7000;
const DEFAULT_MAX_RESPONSE_BYTES = 2_000_000;

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isPrivateHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  if (!normalized) return true;
  if (normalized === "localhost" || normalized.endsWith(".localhost")) return true;
  if (normalized === "::1" || normalized === "[::1]") return true;
  if (normalized.endsWith(".local") || normalized.endsWith(".internal")) return true;
  return isPrivateIpv4(normalized);
}

export function validateServerIntegrationBaseUrl(raw: string) {
  const url = new URL(raw);
  const production = process.env.NODE_ENV === "production";
  if (production && url.protocol !== "https:") {
    throw new Error("POS_ENDPOINT_HTTPS_REQUIRED");
  }
  if (!["https:", "http:"].includes(url.protocol)) {
    throw new Error("POS_ENDPOINT_PROTOCOL_NOT_ALLOWED");
  }
  if (production && isPrivateHostname(url.hostname)) {
    throw new Error("POS_ENDPOINT_PRIVATE_NETWORK_NOT_ALLOWED");
  }
  url.username = "";
  url.password = "";
  url.hash = "";
  return url;
}

export function createHardenedServerFetch(options?: {
  timeoutMs?: number;
  maxResponseBytes?: number;
  fetchImpl?: typeof fetch;
}): typeof fetch {
  const timeoutMs = Math.max(1000, Math.min(30_000, Math.floor(options?.timeoutMs || DEFAULT_TIMEOUT_MS)));
  const maxResponseBytes = Math.max(64_000, Math.min(10_000_000, Math.floor(options?.maxResponseBytes || DEFAULT_MAX_RESPONSE_BYTES)));
  const baseFetch = options?.fetchImpl || fetch;

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const requested = new URL(typeof input === "string" || input instanceof URL ? input.toString() : input.url);
    if (process.env.NODE_ENV === "production") validateServerIntegrationBaseUrl(`${requested.protocol}//${requested.host}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const externalSignal = init?.signal;
    const abortFromExternal = () => controller.abort();
    externalSignal?.addEventListener("abort", abortFromExternal, { once: true });

    try {
      const response = await baseFetch(requested, {
        ...init,
        redirect: "error",
        signal: controller.signal,
      });

      const declaredLength = Number(response.headers.get("content-length") || "0");
      if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
        throw new Error("OUTBOUND_RESPONSE_TOO_LARGE");
      }

      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > maxResponseBytes) {
        throw new Error("OUTBOUND_RESPONSE_TOO_LARGE");
      }

      const headers = new Headers(response.headers);
      headers.set("content-length", String(bytes.byteLength));
      return new Response(bytes, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", abortFromExternal);
    }
  }) as typeof fetch;
}
