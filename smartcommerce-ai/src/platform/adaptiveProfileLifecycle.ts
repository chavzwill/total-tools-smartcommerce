import type { PlatformEntityId, PlatformMetadata } from "./contracts";
import type {
  AdaptiveMappingPolicy,
  AdaptiveProviderProfile,
  ProviderCapability,
  SmartCommerceCapability,
} from "./adaptiveIntegration";

export type AdaptiveCapabilityDecision = "approved" | "rejected" | "revoked";

export type AdaptiveCapabilityDecisionRecord = {
  id: string;
  capability: SmartCommerceCapability;
  decision: AdaptiveCapabilityDecision;
  decidedAt: string;
  decidedBy?: PlatformEntityId;
  reason?: string;
  endpointId?: string;
  confidence?: number;
  metadata?: PlatformMetadata;
};

export type PersistedAdaptiveProviderProfile = AdaptiveProviderProfile & {
  revision: number;
  updatedAt: string;
  decisions: AdaptiveCapabilityDecisionRecord[];
};

export interface AdaptiveProfileRepository {
  load(profileId: string): Promise<PersistedAdaptiveProviderProfile | undefined>;
  save(profile: PersistedAdaptiveProviderProfile): Promise<void>;
  remove(profileId: string): Promise<void>;
}

export class InMemoryAdaptiveProfileRepository implements AdaptiveProfileRepository {
  private readonly profiles = new Map<string, PersistedAdaptiveProviderProfile>();

  async load(profileId: string) {
    return this.profiles.get(profileId);
  }

  async save(profile: PersistedAdaptiveProviderProfile) {
    this.profiles.set(profile.id, profile);
  }

  async remove(profileId: string) {
    this.profiles.delete(profileId);
  }
}

const bestMapping = (capability: ProviderCapability) =>
  [...capability.routeMappings].sort((a, b) => b.confidence - a.confidence)[0];

const asPersisted = (
  profile: AdaptiveProviderProfile,
  previous?: PersistedAdaptiveProviderProfile
): PersistedAdaptiveProviderProfile => ({
  ...profile,
  revision: (previous?.revision || 0) + 1,
  updatedAt: new Date().toISOString(),
  decisions: previous?.decisions || [],
});

export class AdaptiveProfileLifecycle {
  constructor(
    private readonly repository: AdaptiveProfileRepository,
    private readonly policy: AdaptiveMappingPolicy
  ) {}

  async persist(profile: AdaptiveProviderProfile) {
    const previous = await this.repository.load(profile.id);
    const persisted = asPersisted(profile, previous);
    await this.repository.save(persisted);
    return persisted;
  }

  async load(profileId: string) {
    return this.repository.load(profileId);
  }

  async approveCapability(input: {
    profileId: string;
    capability: SmartCommerceCapability;
    decidedBy?: PlatformEntityId;
    reason?: string;
    metadata?: PlatformMetadata;
  }) {
    const profile = await this.repository.load(input.profileId);
    if (!profile) throw new Error(`Adaptive provider profile ${input.profileId} was not found.`);

    const capability = profile.capabilities.find((item) => item.capability === input.capability);
    if (!capability) throw new Error(`Capability ${input.capability} was not discovered for this provider.`);

    const mapping = bestMapping(capability);
    if (!mapping) throw new Error(`Capability ${input.capability} has no validated route mapping to approve.`);

    if (mapping.confidence < this.policy.minimumWriteConfidence) {
      throw new Error(`Capability ${input.capability} does not meet the write confidence threshold.`);
    }

    const updated: PersistedAdaptiveProviderProfile = {
      ...profile,
      revision: profile.revision + 1,
      updatedAt: new Date().toISOString(),
      validatedAt: new Date().toISOString(),
      capabilities: profile.capabilities.map((item) =>
        item.capability === input.capability
          ? { ...item, availability: "available", reason: "Explicitly approved after mapping verification." }
          : item
      ),
      decisions: [
        ...profile.decisions,
        {
          id: `${profile.id}:${input.capability}:${Date.now()}`,
          capability: input.capability,
          decision: "approved",
          decidedAt: new Date().toISOString(),
          decidedBy: input.decidedBy,
          reason: input.reason,
          endpointId: mapping.endpointId,
          confidence: mapping.confidence,
          metadata: input.metadata,
        },
      ],
    };

    await this.repository.save(updated);
    return updated;
  }

  async rejectCapability(input: {
    profileId: string;
    capability: SmartCommerceCapability;
    decidedBy?: PlatformEntityId;
    reason?: string;
    metadata?: PlatformMetadata;
  }) {
    return this.recordBlockingDecision({ ...input, decision: "rejected" });
  }

  async revokeCapability(input: {
    profileId: string;
    capability: SmartCommerceCapability;
    decidedBy?: PlatformEntityId;
    reason?: string;
    metadata?: PlatformMetadata;
  }) {
    return this.recordBlockingDecision({ ...input, decision: "revoked" });
  }

  private async recordBlockingDecision(input: {
    profileId: string;
    capability: SmartCommerceCapability;
    decision: "rejected" | "revoked";
    decidedBy?: PlatformEntityId;
    reason?: string;
    metadata?: PlatformMetadata;
  }) {
    const profile = await this.repository.load(input.profileId);
    if (!profile) throw new Error(`Adaptive provider profile ${input.profileId} was not found.`);

    const capability = profile.capabilities.find((item) => item.capability === input.capability);
    if (!capability) throw new Error(`Capability ${input.capability} was not discovered for this provider.`);
    const mapping = bestMapping(capability);

    const updated: PersistedAdaptiveProviderProfile = {
      ...profile,
      revision: profile.revision + 1,
      updatedAt: new Date().toISOString(),
      capabilities: profile.capabilities.map((item) =>
        item.capability === input.capability
          ? { ...item, availability: "disabled", reason: input.reason || `Capability ${input.decision}.` }
          : item
      ),
      decisions: [
        ...profile.decisions,
        {
          id: `${profile.id}:${input.capability}:${Date.now()}`,
          capability: input.capability,
          decision: input.decision,
          decidedAt: new Date().toISOString(),
          decidedBy: input.decidedBy,
          reason: input.reason,
          endpointId: mapping?.endpointId,
          confidence: mapping?.confidence,
          metadata: input.metadata,
        },
      ],
    };

    await this.repository.save(updated);
    return updated;
  }
}
