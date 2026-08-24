import { getPaymentAttemptForCustomer } from "../src/server/paymentSettlement.js";
import { applyVerifiedProviderEvidence } from "../src/server/paymentProviderEvidence.js";
import { getPaymentProviderAdapter, type PaymentProviderKey } from "../src/server/paymentProviderAdapters.js";
import { resolvePaymentPrincipal } from "../src/server/paymentPrincipal.js";

function redirect(response:any, location:string) {
  response.statusCode = 303;
  response.setHeader("Location", location);
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Referrer-Policy", "same-origin");
  response.end();
}

export default async function handler(request:any,response:any) {
  if (String(request.method || "GET").toUpperCase() !== "GET") {
    response.setHeader("Allow", "GET");
    response.statusCode = 405;
    return response.end();
  }
  try {
    const principal = await resolvePaymentPrincipal(request);
    if (!principal) return redirect(response, "/#/checkout?payment=identity-required");
    const destination = principal.kind === "customer" ? "/#/account/orders" : "/#/guest-order";

    const provider = String(request.query?.provider || "").trim() as PaymentProviderKey;
    const attemptId = String(request.query?.attemptId || "").trim();
    if (!provider || !attemptId || attemptId.length > 100) return redirect(response, "/#/checkout?payment=invalid-return");

    const attempt = await getPaymentAttemptForCustomer({ customerId:principal.subjectId, attemptId });
    if (!attempt) return redirect(response, "/#/checkout?payment=attempt-not-found");
    if (String(attempt.provider || "") !== provider) return redirect(response, "/#/checkout?payment=provider-mismatch");
    if (request.query?.cancel === "1") return redirect(response, `/#/checkout?payment=cancelled&attemptId=${encodeURIComponent(attemptId)}`);
    if (attempt.status === "confirmed") return redirect(response, `${destination}?payment=confirmed&attemptId=${encodeURIComponent(attemptId)}`);

    const providerPaymentId = String(attempt.provider_payment_id || "").trim();
    if (!providerPaymentId) return redirect(response, `${destination}?payment=pending&attemptId=${encodeURIComponent(attemptId)}`);
    const adapter = getPaymentProviderAdapter(provider);
    if (!adapter?.completeReturn) return redirect(response, `${destination}?payment=pending&attemptId=${encodeURIComponent(attemptId)}`);

    const evidence = await adapter.completeReturn({ attemptId, providerPaymentId, query: request.query || {} });
    const applied = await applyVerifiedProviderEvidence(provider, evidence);
    const state = evidence.status === "confirmed" && applied.applied ? "confirmed" : evidence.status === "failed" ? "failed" : "pending";
    const finalDestination = principal.kind === "guest" && state === "failed" ? "/#/checkout" : destination;
    return redirect(response, `${finalDestination}?payment=${state}&attemptId=${encodeURIComponent(attemptId)}`);
  } catch (error:any) {
    console.error("payment_provider_return_error", { code: error instanceof Error ? error.message : "unknown" });
    return redirect(response, "/#/checkout?payment=verification-pending");
  }
}
