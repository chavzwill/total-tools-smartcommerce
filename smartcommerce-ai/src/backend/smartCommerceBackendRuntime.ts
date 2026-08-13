import type {
  AdaptiveProfileRepository,
  PosAdapter,
  PosAdapterContext,
} from "../platform";
import { createPlatformBackendService } from "./platformBackendService";
import {
  createCapabilityGuardedPosAdapter,
  type CapabilityGuardedPosAdapterOptions,
} from "./capabilityGuardedPosAdapter";
import { createRentalVerificationEnforcedAdapter } from "./rentalVerificationEnforcedAdapter";
import {
  AdaptiveIntegrationAdminService,
  type AdaptiveIntegrationAdminOptions,
} from "./adaptiveIntegrationAdminService";

export type SmartCommerceBackendRuntimeOptions = {
  providerAdapter: PosAdapter;
  adaptiveProfiles: AdaptiveProfileRepository;
  resolveContext(request: Request): PosAdapterContext | Promise<PosAdapterContext>;
  capabilityGuard?: CapabilityGuardedPosAdapterOptions;
  adaptiveAdmin?: AdaptiveIntegrationAdminOptions;
};

/**
 * Canonical server composition for a provider-backed SmartCommerce runtime.
 *
 * Execution order:
 * raw provider adapter
 * -> persisted capability guard
 * -> rental verification enforcement
 * -> platform backend service
 *
 * The same persisted adaptive-profile repository is used by the administrative
 * approval lifecycle and the execution guard, so an approval/revocation takes
 * effect on subsequent provider calls without a separate configuration path.
 */
export const createSmartCommerceBackendRuntime = (
  options: SmartCommerceBackendRuntimeOptions
) => {
  const capabilityGuardedAdapter = createCapabilityGuardedPosAdapter(
    options.providerAdapter,
    options.adaptiveProfiles,
    options.capabilityGuard
  );

  const executionAdapter = createRentalVerificationEnforcedAdapter(
    capabilityGuardedAdapter
  );

  const platformService = createPlatformBackendService({
    adapter: executionAdapter,
    resolveContext: options.resolveContext,
  });

  const adaptiveAdminService = new AdaptiveIntegrationAdminService({
    repository: options.adaptiveProfiles,
    ...options.adaptiveAdmin,
  });

  return {
    platformService,
    adaptiveAdminService,
    executionAdapter,
  };
};
