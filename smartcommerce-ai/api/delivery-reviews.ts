import { canStaff, parseCookie, readStaffSession, STAFF_COOKIE_NAME } from "../src/server/staffSession.js";
import { firstHeader, recordSecurityEvent } from "../src/server/securityInfrastructure.js";
import { listManualDeliveryReviews, priceManualDeliveryReview } from "../src/server/deliveryReviewQueue.js";

const MAX_BODY_BYTES = 16_000;

function sameOrigin(request: any) {
  const origin = firstHeader(request.headers?.origin);
  if (!origin) return true;
  const host = firstHeader(request.headers?.host);
  if (!host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

function staffFromRequest(request: any) {
  const token = parseCookie(firstHeader(request.headers?.cookie))[STAFF_COOKIE_NAME];
  return readStaffSession(token);
}

function canReview(staff: ReturnType<typeof staffFromRequest>) {
  return canStaff(staff, "delivery_review") || canStaff(staff, "purchasing_approve") || canStaff(staff, "rentals_manage_items");
}

async function readJsonBody<T>(request: AsyncIterable<unknown>): Promise<T> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    if (chunk == null) continue;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    total += buffer.length;
    if (total > MAX_BODY_BYTES) throw Object.assign(new Error("REQUEST_TOO_LARGE"), { status: 413 });
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as T;
}

function send(response: any, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");
  response.end(JSON.stringify(payload));
}

export default async function handler(request: any, response: any) {
  const method = String(request.method || "GET").toUpperCase();
  if (!sameOrigin(request)) return send(response, 403, { error: { code: "ORIGIN_REJECTED", message: "This request was rejected." } });

  try {
    const staff = staffFromRequest(request);
    if (!staff) return send(response, 401, { error: { code: "STAFF_AUTH_REQUIRED", message: "Staff sign-in is required." } });
    if (!canReview(staff)) {
      await recordSecurityEvent({ request, eventType: "delivery_review_access_denied", eventStatus: "blocked", riskLevel: "high", subject: staff.employeeId }).catch(() => undefined);
      return send(response, 403, { error: { code: "DELIVERY_REVIEW_FORBIDDEN", message: "Your staff role is not authorized to review delivery pricing." } });
    }

    if (method === "GET") {
      const url = new URL(request.url || "/api/delivery-reviews", "https://smartcommerce.internal");
      const status = String(url.searchParams.get("status") || "pending");
      const reviews = await listManualDeliveryReviews(status);
      return send(response, 200, { reviews, staff: { employeeId: staff.employeeId, username: staff.username, role: staff.role } });
    }

    if (method !== "POST") {
      response.setHeader("Allow", "GET, POST");
      return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "GET or POST is required." } });
    }

    const input = await readJsonBody<{
      id?: string;
      action?: "price";
      providerName?: string;
      vehicleClass?: string;
      providerCostMinor?: number;
      customerChargeMinor?: number;
      currency?: string;
      scheduledFor?: string;
      staffNotes?: string;
    }>(request);
    if (input.action !== "price") return send(response, 400, { error: { code: "INVALID_REVIEW_ACTION", message: "That delivery-review action is not supported." } });

    const review = await priceManualDeliveryReview({
      id: String(input.id || "").trim(),
      reviewedBy: staff.employeeId,
      providerName: input.providerName,
      vehicleClass: input.vehicleClass,
      providerCostMinor: Number(input.providerCostMinor || 0),
      customerChargeMinor: Number(input.customerChargeMinor || 0),
      currency: input.currency,
      scheduledFor: input.scheduledFor,
      staffNotes: input.staffNotes,
    });

    await recordSecurityEvent({ request, eventType: "delivery_manual_review_priced", eventStatus: "priced", riskLevel: "medium", subject: staff.employeeId, metadata: { reviewId: review.id, quoteId: review.quote_id, customerChargeMinor: Number(review.customer_charge_minor || 0), providerCostMinor: Number(review.provider_cost_minor || 0) } }).catch(() => undefined);
    return send(response, 200, { review });
  } catch (error: any) {
    if (error instanceof SyntaxError) return send(response, 400, { error: { code: "INVALID_JSON", message: "The request body is invalid." } });
    if (Number(error?.status) === 413) return send(response, 413, { error: { code: "REQUEST_TOO_LARGE", message: "The request is too large." } });
    if (error?.message === "INVALID_MANUAL_DELIVERY_PRICE") return send(response, 400, { error: { code: error.message, message: "Enter a valid customer delivery charge before pricing this review." } });
    if (error?.message === "DELIVERY_REVIEW_NOT_FOUND") return send(response, 404, { error: { code: error.message, message: "That delivery review no longer exists." } });
    console.error("delivery_reviews_api_error", { code: error instanceof Error ? error.message : "unknown" });
    return send(response, 503, { error: { code: "DELIVERY_REVIEWS_UNAVAILABLE", message: "Delivery reviews are temporarily unavailable.", retryable: true } });
  }
}
