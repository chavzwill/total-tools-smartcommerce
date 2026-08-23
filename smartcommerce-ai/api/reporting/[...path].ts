import { createHardenedServerFetch, validateServerIntegrationBaseUrl } from "../../src/server/hardenedOutboundFetch.js";
import { firstHeader, recordSecurityEvent } from "../../src/server/securityInfrastructure.js";
import { canStaff, parseCookie, readStaffSession, STAFF_COOKIE_NAME } from "../../src/server/staffSession.js";

const ALLOWED_RESOURCES: Record<string, string> = {
  reports: "reports",
  inventory: "products",
  warehouse: "warehouse",
  suppliers: "suppliers",
  "purchase-requests": "purchase-requests",
  "purchase-orders": "purchase-orders",
  transfers: "transfers",
  quotations: "quotations",
  transactions: "transactions",
  drawers: "drawers",
  rentals: "rentals",
  customers: "customers",
  branches: "branches",
  "work-orders": "work-orders",
  commissions: "commissions",
  layaway: "layaway",
};

function send(response: any, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");
  response.end(JSON.stringify(payload));
}

function configuredPos() {
  const raw = process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_URL?.trim();
  if (!raw) throw new Error("POS_NOT_CONFIGURED");
  return validateServerIntegrationBaseUrl(raw).toString().replace(/\/$/, "");
}

function requestedSegments(request: any) {
  const raw = request.query?.path;
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "string") return raw.split("/").filter(Boolean);
  const pathname = new URL(String(request.url || "/"), "https://smartcommerce.local").pathname;
  return pathname.replace(/^\/api\/reporting\/?/, "").split("/").filter(Boolean);
}

export default async function handler(request: any, response: any) {
  if (String(request.method || "GET").toUpperCase() !== "GET") {
    response.setHeader("Allow", "GET");
    return send(response, 405, { success: false, error: { code: "REPORTING_READ_ONLY", message: "Reporting access is read-only." } });
  }

  const token = parseCookie(firstHeader(request.headers?.cookie))[STAFF_COOKIE_NAME];
  const staff = readStaffSession(token);
  if (!staff) return send(response, 401, { success: false, error: { code: "STAFF_AUTH_REQUIRED", message: "Staff sign-in is required." } });
  if (!canStaff(staff, "reports")) {
    await recordSecurityEvent({ request, eventType: "reporting_permission_denied", eventStatus: "blocked", riskLevel: "high", subject: staff.employeeId }).catch(() => undefined);
    return send(response, 403, { success: false, error: { code: "STAFF_PERMISSION_DENIED", message: "Your security group does not allow reports." } });
  }

  const segments = requestedSegments(request);
  const resource = segments[0] || "";
  const upstreamRoot = ALLOWED_RESOURCES[resource];
  if (!upstreamRoot) return send(response, 404, { success: false, error: { code: "REPORTING_RESOURCE_NOT_FOUND", message: "That reporting resource is not exposed." } });

  try {
    const baseUrl = configuredPos();
    const upstreamSegments = [upstreamRoot, ...segments.slice(1)].map((segment) => encodeURIComponent(segment));
    const incoming = new URL(String(request.url || "/"), "https://smartcommerce.local");
    const upstreamUrl = new URL(`${baseUrl}/api/${upstreamSegments.join("/")}`);
    incoming.searchParams.forEach((value, key) => { if (key !== "path") upstreamUrl.searchParams.append(key, value); });

    const headers: Record<string, string> = { Accept: "application/json" };
    const apiKey = process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_API_KEY?.trim();
    if (apiKey) headers["X-API-Key"] = apiKey;
    headers["X-SmartCommerce-Actor-Id"] = staff.employeeId;
    if (staff.defaultBranchId) headers["X-SmartCommerce-Branch-Id"] = staff.defaultBranchId;

    const requestFetch = createHardenedServerFetch({ timeoutMs: 12_000, maxResponseBytes: 6_000_000 });
    const upstream = await requestFetch(upstreamUrl, { method: "GET", headers });
    const bytes = Buffer.from(await upstream.arrayBuffer());
    response.statusCode = upstream.status;
    response.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.end(bytes);
  } catch (error) {
    const code = error instanceof Error ? error.message : "REPORTING_UNAVAILABLE";
    console.error("reporting_gateway_error", { code, resource });
    return send(response, 503, { success: false, error: { code: "REPORTING_UNAVAILABLE", message: "Reporting data is temporarily unavailable.", retryable: true } });
  }
}
