/** Helpers of the managed-sources tests: documents the way a host reads them, and what they compose to. */
import type { Settings } from '../../src/protocol/official.ts';
import {
  MANAGED_SOURCES,
  composeManaged,
  readAdminDocument,
  type AdminDocument,
  type HelperFileProbe,
  type ManagedComposition,
  type ManagedSource,
  type SourceRead,
} from '../../src/settings/managed/index.ts';

/** The document a source holds when its JSON is `value`. */
export const found = (value: unknown): SourceRead => ({ value });

const REGISTRY: readonly ManagedSource[] = ['hklm', 'hkcu'];

/** The document of `source` holding `settings`; a registry value stores its JSON as text. */
export const document = (source: ManagedSource, settings: unknown): AdminDocument =>
  readAdminDocument(source, found(REGISTRY.includes(source) ? JSON.stringify(settings) : settings));

type Held = Partial<Record<ManagedSource, unknown>>;

/** What the sources a machine holds compose to, each given as its JSON. */
export const compose = (held: Held, parentRestrictive = false): ManagedComposition =>
  composeManaged(
    MANAGED_SOURCES.flatMap((source) => {
      const settings = held[source];
      return settings === undefined ? [] : [document(source, settings)];
    }),
    { parentRestrictive },
  );

/** The managed settings in force for the sources a machine holds. */
export const policyOf = (held: Held) => compose(held).layer.settings;

/** The settings a host passes as parent settings: raw JSON, repaired as a settings source is. */
export const parentOf = (raw: object): Settings => readAdminDocument('file', found(raw)).settings;

/** A `HelperFileProbe` over a set of regular files; `slow` makes the check take that long (an unresponsive mount). */
export function fileProbe(
  files: readonly string[],
  options: { readonly slow?: number; readonly clock?: { advance(ms: number): void } } = {},
): HelperFileProbe {
  return {
    check: (path, budgetMs) => {
      options.clock?.advance(options.slow ?? 0);
      const timedOut = options.slow !== undefined && options.slow >= budgetMs;
      return Promise.resolve({ regularFile: files.includes(path), timedOut });
    },
  };
}
