import { handlePlatformRestRequest } from "../src/backend/platformRestApi.js";
import { createConfiguredTotalToolsPlatformService } from "../src/integrations/totalToolsPlatformRuntime.js";
import { parseCookie, readStaffSession, STAFF_COOKIE_NAME, canStaff } from "../src/server/staffSession.js";
import { enforceDurableRateLimit, requestIp } from "../src/server/securityInfrastructure.js";

const platformService = createConfiguredTotalToolsPlatformService();
function firstHeader(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function present(name: string) { return Boolean(String(process.env[name] || "").trim()); }
function send(response: any, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(payload));
}
function headers() {
  const h = new Headers({ Accept: "application/json" });
  const business = process.env.SMARTCOMMERCE_BUSINESS_ACCOUNT_ID?.trim();
  const provider = process.env.SMARTCOMMERCE_PROVIDER_ID?.trim();
  if (business) h.set("x-business-account-id", business);
  if (provider) h.set("x-provider-id", provider);
  return h;
}
async function platformGet(path: string) {
  const response = await handlePlatformRestRequest(new Request(`https://smartcommerce.internal/api/platform${path}`, { headers: headers() }), platformService);
  const payload = await response.json().catch(() => null) as any;
  return { ok: response.ok && Boolean(payload?.success), status: response.status, payload };
}

export default async function handler(request: any, response: any) {
  if (String(request.method || "GET").toUpperCase() !== "GET") {
    response.setHeader("Allow", "GET");
    return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "GET is required." } });
  }
  try {
    const token = parseCookie(firstHeader(request.headers?.cookie))[STAFF_COOKIE_NAME];
    const staff = readStaffSession(token);
    if (!staff) return send(response, 401, { error: { code: "STAFF_AUTH_REQUIRED", message: "Staff sign-in is required." } });
    if (!canStaff(staff, "delivery_review")) return send(response, 403, { error: { code: "POS_READINESS_ACCESS_DENIED", message: "Your staff role cannot view integration readiness." } });
    await enforceDurableRateLimit({ request, action: "pos_readiness", subject: staff.employeeId || requestIp(request), limit: 120, windowSeconds: 600 });

    const configured = {
      posUrl: present("SMARTCOMMERCE_TOTAL_TOOLS_POS_URL"),
      apiKey: present("SMARTCOMMERCE_TOTAL_TOOLS_POS_API_KEY"),
      businessAccountId: present("SMARTCOMMERCE_BUSINESS_ACCOUNT_ID"),
      providerId: present("SMARTCOMMERCE_PROVIDER_ID"),
      inventoryBranchId: present("SMARTCOMMERCE_TOTAL_TOOLS_DEFAULT_BRANCH_ID") || present("SMARTCOMMERCE_FULFILMENT_BRANCH_ID"),
      onlineEmployeeId: present("SMARTCOMMERCE_TOTAL_TOOLS_POS_ONLINE_EMPLOYEE_ID"),
      writeGuardDatabase: present("SMARTCOMMERCE_DATABASE_URL") || present("DATABASE_URL"),
    };
    const health = await platformGet("/integrations/health");
    const branches = health.ok ? await platformGet("/branches") : { ok: false, status: 503, payload: null };
    const capability = health.payload?.data?.capabilities || {};
    const branchCount = Array.isArray(branches.payload?.data) ? branches.payload.data.length : 0;

    return send(response, 200, {
      configured,
      connected: health.ok,
      provider: health.payload?.data?.displayName || "Total Tools POS",
      checkedAt: new Date().toISOString(),
      branchCount,
      capabilities: {
        branches: Boolean(capability.branches),
        categories: Boolean(capability.categories),
        products: Boolean(capability.products),
        inventory: Boolean(capability.inventory),
        pricing: Boolean(capability.pricing),
        customers: Boolean(capability.customers),
        orders: Boolean(capability.orders),
        invoices: Boolean(capability.invoices),
        rentals: Boolean(capability.rentals),
        repairs: Boolean(capability.repairs),
        commercialQuotes: Boolean(capability.commercialQuotes),
      },
      writeCompatibility: {
        customerSync: Boolean(capability.customers),
        pickupCommercialCreditOrders: Boolean(capability.customers && configured.onlineEmployeeId && configured.writeGuardDatabase),
        deliveryOrders: false,
        invoices: false,
        safeguards: {
          smartCommerceWriteGuard: true,
          ambiguousWriteQuarantine: true,
          exactCustomerDeduplication: true,
          posNativeIdempotency: false,
          explicitPosDeliveryCharge: false,
        },
      },
      blockers: [
        ...(!configured.posUrl ? ["POS_BASE_URL_NOT_CONFIGURED"] : []),
        ...(!configured.apiKey ? ["POS_API_KEY_NOT_CONFIGURED"] : []),
        ...(!configured.businessAccountId ? ["BUSINESS_ACCOUNT_ID_NOT_CONFIGURED"] : []),
        ...(!configured.providerId ? ["PROVIDER_ID_NOT_CONFIGURED"] : []),
        ...(!configured.inventoryBranchId ? ["INVENTORY_BRANCH_NOT_CONFIGURED"] : []),
        ...(!configured.onlineEmployeeId ? ["POS_ONLINE_EMPLOYEE_NOT_CONFIGURED"] : []),
        ...(!configured.writeGuardDatabase ? ["POS_WRITE_GUARD_DATABASE_NOT_CONFIGURED"] : []),
        ...(!health.ok ? ["POS_HEALTH_CHECK_FAILED"] : []),
        ...(capability.customers ? [] : ["POS_CUSTOMER_WRITE_NOT_SUPPORTED"]),
        "POS_NATIVE_IDEMPOTENCY_NOT_SUPPORTED",
        "POS_DELIVERY_CHARGE_FIELD_NOT_SUPPORTED",
        "POS_INVOICE_WRITE_NOT_SUPPORTED",
      ],
    });
  } catch (error: any) {
    if (error?.message === "RATE_LIMITED") return send(response, 429, { error: { code: "RATE_LIMITED", message: "Too many readiness checks. Please wait and try again." } });
    console.error("pos_readiness_error", { code: error instanceof Error ? error.message : "unknown" });
    return send(response, 503, { error: { code: "POS_READINESS_UNAVAILABLE", message: "POS readiness is temporarily unavailable." } });
  }
}
