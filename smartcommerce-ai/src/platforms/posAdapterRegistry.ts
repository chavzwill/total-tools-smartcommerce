import type {
  PosAdapter,
  PosAdapterConfig,
  PosAdapterName,
} from "./posAdapter";
import { createUnsupportedAdapter } from "./posAdapter";

const adapters = new Map<PosAdapterName, PosAdapter>();

let activeConfig: PosAdapterConfig = {
  name: "custom_pos",
  displayName: "Custom POS",
};

export function registerPosAdapter(name: PosAdapterName, adapter: PosAdapter) {
  adapters.set(name, adapter);
}

export function setActivePosAdapter(config: PosAdapterConfig) {
  activeConfig = config;
}

export function getActivePosAdapterConfig(): PosAdapterConfig {
  return activeConfig;
}

export function getActivePosAdapter(): PosAdapter {
  const adapter = adapters.get(activeConfig.name);

  if (adapter) {
    return adapter;
  }

  return createUnsupportedAdapter(activeConfig);
}

export function hasRegisteredPosAdapter(name: PosAdapterName): boolean {
  return adapters.has(name);
}

export function clearRegisteredPosAdapters() {
  adapters.clear();
}