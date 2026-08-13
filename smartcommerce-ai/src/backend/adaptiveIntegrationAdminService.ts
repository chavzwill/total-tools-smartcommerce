import type {
  AdaptiveMappingPolicy,
  BusinessSystemKind,
  DiscoveredProviderEndpoint,
  SmartCommerceCapability,
} from "../platform/adaptiveIntegration";
import { defaultAdaptiveMappingPolicy } from "../platform/adaptiveIntegration";
import { runAdaptiveDiscovery } from "../platform/adaptiveMappingEngine";
import {
  AdaptiveProfileLifecycle,
  type AdaptiveProfileRepository,
} from "../platform/adaptiveProfileLifecycle";
import type { PlatformEntityId } from "../platform/contracts";

export type AdaptiveIntegrationAdminContext = {
  businessAccountId: PlatformEntityId;
  providerId: string;
  connectionId?: PlatformEntityId;
  actorId?: PlatformEntityId;
};

export type DiscoverAdaptiveProviderInput = {
  providerKind?: BusinessSystemKind;
  apiDescription?: unknown;
  endpoints?: DiscoveredProviderEndpoint[];
  policy?: Partial<AdaptiveMappingPolicy>;
};

const profileIdFor = (context: AdaptiveIntegrationAdminContext) =>
  `${context.businessAccountId}:${context.providerId}:adaptive-profile`;

export class AdaptiveIntegrationAdminService {
  constructor(
    private readonly repository: AdaptiveProfileRepository,
    private readonly basePolicy: AdaptiveMappingPolicy = defaultAdaptiveMappingPolicy
  ) {}

  async getProfile(context: AdaptiveIntegrationAdminContext) {
    return this.repository.load(profileIdFor(context));
  }

  async discoverAndPersist(
    context: AdaptiveIntegrationAdminContext,
    input: DiscoverAdaptiveProviderInput
  ) {
    const policy = { ...this.basePolicy, ...input.policy };
    const discovery = runAdaptiveDiscovery({
      businessAccountId: context.businessAccountId,
      connectionId: context.connectionId,
      providerId: context.providerId,
      providerKind: input.providerKind,
      apiDescription: input.apiDescription,
      endpoints: input.endpoints,
      policy,
    });

    const lifecycle = new AdaptiveProfileLifecycle(this.repository, policy);
    const profile = await lifecycle.persist(discovery.profile);
    return { ...discovery, profile };
  }

  async approveCapability(
    context: AdaptiveIntegrationAdminContext,
    capability: SmartCommerceCapability,
    reason?: string
  ) {
    const lifecycle = new AdaptiveProfileLifecycle(this.repository, this.basePolicy);
    return lifecycle.approveCapability({
      profileId: profileIdFor(context),
      capability,
      decidedBy: context.actorId,
      reason,
    });
  }

  async rejectCapability(
    context: AdaptiveIntegrationAdminContext,
    capability: SmartCommerceCapability,
    reason?: string
  ) {
    const lifecycle = new AdaptiveProfileLifecycle(this.repository, this.basePolicy);
    return lifecycle.rejectCapability({
      profileId: profileIdFor(context),
      capability,
      decidedBy: context.actorId,
      reason,
    });
  }

  async revokeCapability(
    context: AdaptiveIntegrationAdminContext,
    capability: SmartCommerceCapability,
    reason?: string
  ) {
    const lifecycle = new AdaptiveProfileLifecycle(this.repository, this.basePolicy);
    return lifecycle.revokeCapability({
      profileId: profileIdFor(context),
      capability,
      decidedBy: context.actorId,
      reason,
    });
  }
}
