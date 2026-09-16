export type StoredSyncVersion = {
  entityVersion: number;
  payloadHash: string;
  eventId?: string;
};

export type IncomingSyncVersion = {
  entityVersion: number;
  payloadHash: string;
  eventId: string;
};

export type SyncVersionDecision =
  | { action: "apply"; reason: "new_entity" | "newer_version" }
  | { action: "replayed"; reason: "identical_event" | "identical_version_payload" }
  | { action: "stale"; reason: "older_version" }
  | { action: "conflict"; reason: "same_version_conflicting_payload" | "event_id_collision" };

export function classifyIncomingSyncEvent(
  current: StoredSyncVersion | undefined,
  incoming: IncomingSyncVersion,
): SyncVersionDecision {
  if (!Number.isSafeInteger(incoming.entityVersion) || incoming.entityVersion < 0) {
    throw new Error("INVALID_ENTITY_VERSION");
  }
  if (!current) return { action: "apply", reason: "new_entity" };
  if (current.eventId && current.eventId === incoming.eventId) {
    return current.entityVersion === incoming.entityVersion && current.payloadHash === incoming.payloadHash
      ? { action: "replayed", reason: "identical_event" }
      : { action: "conflict", reason: "event_id_collision" };
  }
  if (incoming.entityVersion < current.entityVersion) {
    return { action: "stale", reason: "older_version" };
  }
  if (incoming.entityVersion === current.entityVersion) {
    return incoming.payloadHash === current.payloadHash
      ? { action: "replayed", reason: "identical_version_payload" }
      : { action: "conflict", reason: "same_version_conflicting_payload" };
  }
  return { action: "apply", reason: "newer_version" };
}
