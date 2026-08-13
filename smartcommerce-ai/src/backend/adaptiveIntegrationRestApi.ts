import type { PlatformApiResult } from "../platform/contracts";
import type { SmartCommerceCapability } from "../platform/adaptiveIntegration";
import type {
  AdaptiveIntegrationAdminContext,
  AdaptiveIntegrationAdminService,
  DiscoverAdaptiveProviderInput,
} from "./adaptiveIntegrationAdminService";

export type AdaptiveIntegrationRestOptions = {
  service?: AdaptiveIntegrationAdminService;
  authorize?: (request: Request) => boolean | Promise<boolean>;
};

const response = <T>(result: PlatformApiResult<T>, status?: number) =>
  new Response(JSON.stringify(result), {
    status: status || (result.success ? 200 : 400),
    headers: { "Content-Type": "application/json" },
  });

const errorResponse = (
  code: string,
  message: string,
  status: number,
  details?: unknown
) =>
  response(
    {
      success: false,
      error: { code, message, details, retryable: false },
    },
    status
  );

const readJson = async <T>(request: Request): Promise<T> => {
  const text = await request.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
};

const contextFromRequest = (
  request: Request
): AdaptiveIntegrationAdminContext | undefined => {
  const businessAccountId = request.headers.get("x-business-account-id");
  const providerId = request.headers.get("x-provider-id");
  if (!businessAccountId || !providerId) return undefined;

  return {
    businessAccountId,
    providerId,
    connectionId: request.headers.get("x-connection-id") || undefined,
    actorId: request.headers.get("x-actor-id") || undefined,
  };
};

export async function handleAdaptiveIntegrationRestRequest(
  request: Request,
  options: AdaptiveIntegrationRestOptions
): Promise<Response | undefined> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, "");
  if (!path.startsWith("/platform/integrations/adaptive-profile")) {
    return undefined;
  }

  if (!options.service) {
    return errorResponse(
      "ADAPTIVE_PROFILE_PERSISTENCE_NOT_CONFIGURED",
      "Durable adaptive-provider profile persistence is not configured for this runtime.",
      503
    );
  }

  if (!options.authorize || !(await options.authorize(request))) {
    return errorResponse(
      "ADAPTIVE_PROFILE_ADMIN_FORBIDDEN",
      "Adaptive-provider mapping administration requires an authorized server-side operator.",
      403
    );
  }

  const context = contextFromRequest(request);
  if (!context) {
    return errorResponse(
      "PLATFORM_CONTEXT_HEADERS_REQUIRED",
      "X-Business-Account-Id and X-Provider-Id are required.",
      401
    );
  }

  const method = request.method.toUpperCase();
  const segments = path.split("/").filter(Boolean);

  if (path === "/platform/integrations/adaptive-profile" && method === "GET") {
    const profile = await options.service.getProfile(context);
    return profile
      ? response({ success: true, data: profile })
      : errorResponse(
          "ADAPTIVE_PROFILE_NOT_FOUND",
          "No persisted adaptive-provider profile exists for this provider.",
          404
        );
  }

  if (
    path === "/platform/integrations/adaptive-profile/discover" &&
    method === "POST"
  ) {
    const result = await options.service.discoverAndPersist(
      context,
      await readJson<DiscoverAdaptiveProviderInput>(request)
    );
    return response({ success: true, data: result }, 201);
  }

  if (
    segments[0] === "platform" &&
    segments[1] === "integrations" &&
    segments[2] === "adaptive-profile" &&
    segments[3] === "capabilities" &&
    segments[4] &&
    segments[5] &&
    method === "POST"
  ) {
    const capability = decodeURIComponent(segments[4]) as SmartCommerceCapability;
    const decision = segments[5];
    const body = await readJson<{ reason?: string }>(request);

    if (decision === "approve") {
      const profile = await options.service.approveCapability(
        context,
        capability,
        body.reason
      );
      return response({ success: true, data: profile });
    }

    if (decision === "reject") {
      const profile = await options.service.rejectCapability(
        context,
        capability,
        body.reason
      );
      return response({ success: true, data: profile });
    }

    if (decision === "revoke") {
      const profile = await options.service.revokeCapability(
        context,
        capability,
        body.reason
      );
      return response({ success: true, data: profile });
    }
  }

  return errorResponse(
    "ADAPTIVE_PROFILE_ENDPOINT_NOT_FOUND",
    `No adaptive integration management endpoint is registered for ${path}.`,
    404
  );
}
