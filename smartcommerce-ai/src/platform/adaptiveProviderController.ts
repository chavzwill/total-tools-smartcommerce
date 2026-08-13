import type { PlatformEntityId } from "./contracts";
import type { SmartCommerceCapability } from "./adaptiveIntegration";
import type { SmartCommercePlatformApi, ConfigureAdaptiveProviderInput } from "./platformApi";
import {
  AdaptiveProfileLifecycle,
  type AdaptiveProfileRepository,
} from "./adaptiveProfileLifecycle";
import { defaultAdaptiveMappingPolicy, type AdaptiveMappingPolicy } from "./adaptiveIntegration";

export class AdaptiveProviderController {
  private readonly lifecycle: AdaptiveProfileLifecycle;

  constructor(
    private readonly platformApi: SmartCommercePlatformApi,
    repository: AdaptiveProfileRepository,
    policy?: Partial<AdaptiveMappingPolicy>
  ) {
    this.lifecycle = new AdaptiveProfileLifecycle(repository, {
      ...defaultAdaptiveMappingPolicy,
      ...policy,
    });
  }

  async discoverAndPersist(input: ConfigureAdaptiveProviderInput) {
    const discovery = this.platformApi.configureAdaptiveProvider(input);
    const profile = await this.lifecycle.persist(discovery.profile);
    this.platformApi.setCapabilityProfile(profile);
    return { ...discovery, profile };
  }

  async restore(profileId: string) {
    const profile = await this.lifecycle.load(profileId);
    if (profile) this.platformApi.setCapabilityProfile(profile);
    return profile;
  }

  async approve(input: {
    profileId: string;
    capability: SmartCommerceCapability;
    decidedBy?: PlatformEntityId;
    reason?: string;
  }) {
    const profile = await this.lifecycle.approveCapability(input);
    this.platformApi.setCapabilityProfile(profile);
    return profile;
  }

  async reject(input: {
    profileId: string;
    capability: SmartCommerceCapability;
    decidedBy?: PlatformEntityId;
    reason?: string;
  }) {
    const profile = await this.lifecycle.rejectCapability(input);
    this.platformApi.setCapabilityProfile(profile);
    return profile;
  }

  async revoke(input: {
    profileId: string;
    capability: SmartCommerceCapability;
    decidedBy?: PlatformEntityId;
    reason?: string;
  }) {
    const profile = await this.lifecycle.revokeCapability(input);
    this.platformApi.setCapabilityProfile(profile);
    return profile;
  }
}
