/** Helpers for the marketplace registry and command-source tests: a registry over sources of settings. */
import { createMarketplaceGate } from '../../src/settings/marketplaces/index.ts';
import {
  createCommandSourcePolicy,
  createMarketplaceRegistry,
  type CommandSourcePolicy,
  type Registration,
  type RegistryContext,
} from '../../src/settings/marketplaces/index.ts';
import { viewOf, type Source } from './plugin-settings.ts';

/** A machine where every folder is trusted and the official marketplaces are the docs' two. */
const trustingMachine: Pick<RegistryContext, 'isFolderTrusted' | 'officialMarketplaces'> = {
  isFolderTrusted: () => true,
  officialMarketplaces: ['claude-plugins-official'],
};

/** Registrations as the registry plans them, the allowlist and blocklist taken from the sources. */
export function plan(
  sources: readonly Source[],
  machine: Partial<RegistryContext> = {},
): readonly Registration[] {
  const view = viewOf(...sources);
  const gate = createMarketplaceGate(view);
  return createMarketplaceRegistry(view, {
    ...trustingMachine,
    check: (source) => gate.check(source),
    ...machine,
  }).registrations();
}

/** The registration of one name that has the given status, or a failure naming what was planned. */
export function ofName(
  registrations: readonly Registration[],
  name: string,
  status: Registration['status'] = 'register',
): Registration {
  const found = registrations.find((each) => each.name === name && each.status === status);
  if (found === undefined) {
    throw new Error(
      `No ${status} registration of ${name}: ${JSON.stringify(registrations.map((r) => [r.name, r.from, r.status]))}`,
    );
  }
  return found;
}

export const commandSourcesOf = (...sources: readonly Source[]): CommandSourcePolicy =>
  createCommandSourcePolicy(viewOf(...sources));

export const inFolder = (settings: object): Source => ['project', settings];
