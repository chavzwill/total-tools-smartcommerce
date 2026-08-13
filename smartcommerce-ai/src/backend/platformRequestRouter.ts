import type { PlatformBackendService } from "./platformBackendTypes";
import { handlePlatformRestRequest } from "./platformRestApi";
import {
  handleAdaptiveIntegrationRestRequest,
  type AdaptiveIntegrationRestOptions,
} from "./adaptiveIntegrationRestApi";

export async function handlePlatformRequest(
  request: Request,
  service: PlatformBackendService,
  adaptiveOptions: AdaptiveIntegrationRestOptions = {}
): Promise<Response> {
  const adaptive = await handleAdaptiveIntegrationRestRequest(
    request,
    adaptiveOptions
  );
  return adaptive || handlePlatformRestRequest(request, service);
}
