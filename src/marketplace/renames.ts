import { followRenames, type Chain } from '../format/marketplace/renames.ts';
import type { Marketplace } from '../format/marketplace/types.ts';
import { INSTALL_SCOPES, isWritableScope, type InstallScope } from './install-scopes.ts';
import type { RenameStatus } from './types.ts';

/**
 * What a marketplace's `renames` map does to a user who still has an old plugin name (plugins/
 * host-marketplace.md, "Migrate users with a renames map"). Pure decisions over data: the host
 * reads and writes the settings, and shows each notice.
 */

const pluginNames = (marketplace: Marketplace): ReadonlySet<string> =>
  new Set(marketplace.plugins.map((entry) => entry.name));

type ChainOf<E extends Chain['end']> = Extract<Chain, { end: E }>;

/** What each end of a chain means to a user: it loads under the new name, it is gone, or Claude Code has no answer. */
const STATUS_OF_END: {
  readonly [E in Chain['end']]: (chain: ChainOf<E>) => RenameStatus;
} = {
  plugin: (chain) => ({ status: 'renamed', to: chain.name }),
  removed: () => ({ status: 'removed' }),
  dangling: () => ({ status: 'unknown' }),
  cycle: () => ({ status: 'unknown' }),
};

function statusOfEnd<E extends Chain['end']>(end: E, chain: ChainOf<E>): RenameStatus {
  return STATUS_OF_END[end](chain);
}

const statusOfChain = (chain: Chain): RenameStatus => statusOfEnd(chain.end, chain);

/**
 * Where `name` stands in `marketplace`: `current` when it is listed (a listed name wins over a key
 * of the same name, judgment); otherwise the chain from the oldest name, followed to the plugin it
 * ends at (`renamed`) or `null` (`removed`); a name the map does not hold, and a chain that does not
 * resolve, are `unknown`, the case that is `Plugin "<name>" not found in marketplace`.
 */
export function resolveRename(name: string, marketplace: Marketplace): RenameStatus {
  const plugins = pluginNames(marketplace);
  if (plugins.has(name)) return { status: 'current' };
  if (!Object.hasOwn(marketplace.renames, name)) return { status: 'unknown' };
  return statusOfChain(followRenames(marketplace.renames, name, plugins));
}

type StatusOf<S extends RenameStatus['status']> = Extract<RenameStatus, { status: S }>;

/** The text `claude plugin list` and `/plugin` show for a status; nothing for a name that was not renamed or removed. */
const NOTICE: {
  readonly [S in RenameStatus['status']]: (
    status: StatusOf<S>,
    marketplace: string,
  ) => string | undefined;
} = {
  current: () => undefined,
  unknown: () => undefined,
  renamed: (status, marketplace) => `Renamed to "${status.to}" in the "${marketplace}" marketplace`,
  removed: (_status, marketplace) => `Removed from the "${marketplace}" marketplace`,
};

function noticeFor<S extends RenameStatus['status']>(
  status: S,
  given: StatusOf<S>,
  marketplaceName: string,
): string | undefined {
  return NOTICE[status](given, marketplaceName);
}

/** The plugin name a key is rewritten to; nothing when the key is dropped or stays. */
const NEW_NAME: {
  readonly [S in RenameStatus['status']]: (status: StatusOf<S>) => string | undefined;
} = {
  current: () => undefined,
  unknown: () => undefined,
  renamed: (status) => status.to,
  removed: () => undefined,
};

function newNameFor<S extends RenameStatus['status']>(
  status: S,
  given: StatusOf<S>,
): string | undefined {
  return NEW_NAME[status](given);
}

const noticeOf = (status: RenameStatus, marketplaceName: string): string | undefined =>
  noticeFor(status.status, status, marketplaceName);

/** The notice a user sees for `name` in `marketplace`, or nothing when it is current or unknown. */
export const renameNotice = (name: string, marketplace: Marketplace): string | undefined =>
  noticeOf(resolveRename(name, marketplace), marketplace.name);

/** A settings key is `plugin@marketplace`; neither part may hold `@`, so any other shape is not one. */
function splitKey(key: string): { plugin: string; marketplace: string } | undefined {
  const parts = key.split('@');
  const [plugin, marketplace] = parts;
  if (parts.length !== 2 || !plugin || !marketplace) return undefined;
  return { plugin, marketplace };
}

export interface MigratedKeys {
  readonly map: Record<string, unknown>;
  readonly notices: readonly string[];
}

/** What becomes of one key: it stays (`key` is itself), is dropped (`undefined`) or is written under the new key. */
interface KeyMove {
  readonly key: string | undefined;
  readonly notice?: string;
}

function moveKey(key: string, marketplace: Marketplace): KeyMove {
  const parts = splitKey(key);
  if (parts === undefined || parts.marketplace !== marketplace.name) return { key };
  const status = resolveRename(parts.plugin, marketplace);
  const notice = noticeOf(status, marketplace.name);
  if (notice === undefined) return { key };
  const renamedTo = newNameFor(status.status, status);
  return { key: renamedTo === undefined ? undefined : `${renamedTo}@${marketplace.name}`, notice };
}

/**
 * Rewrites the keys of one `enabledPlugins` or `pluginConfigs` map for the marketplace registered
 * as `marketplaceName`: an old name's key becomes the new name's with its value unchanged, the key
 * of a removed plugin is dropped, every other key stays. When the user already has a key under the
 * new name, theirs is kept and the old one dropped (judgment). The notices are those the user sees,
 * each once. The given map is not changed.
 */
export function migrateSettingsKeys(
  map: Readonly<Record<string, unknown>>,
  marketplaceName: string,
  marketplace: Marketplace,
): MigratedKeys {
  const registered =
    marketplace.name === marketplaceName ? marketplace : { ...marketplace, name: marketplaceName };
  const moves = Object.entries(map).map(([key, value]) => ({
    key,
    value,
    move: moveKey(key, registered),
  }));
  const staying = new Set(moves.filter((one) => one.move.key === one.key).map((one) => one.key));
  const out = new Map<string, unknown>();
  for (const { key, value, move } of moves) {
    const target = move.key;
    if (target === undefined || out.has(target)) continue;
    if (target === key || !staying.has(target)) out.set(target, value);
  }
  const notices = new Set(
    moves.flatMap((one) => (one.move.notice === undefined ? [] : [one.move.notice])),
  );
  // `fromEntries` defines each key as data, so a `"__proto__"` key stays a key, not a prototype.
  return { map: Object.fromEntries(out), notices: [...notices] };
}

export type ScopedSettings = { readonly [S in InstallScope]?: Readonly<Record<string, unknown>> };

export interface MigratedScopes {
  readonly scopes: { readonly [S in InstallScope]?: Readonly<Record<string, unknown>> };
  readonly notices: readonly string[];
}

/**
 * `migrateSettingsKeys` over the maps of each scope: user, project and local are rewritten; managed
 * settings cannot be, so they come back as given and their notice is given again on every call
 * until an admin updates them. A notice that several scopes give is given once.
 */
export function migrateSettingsScopes(
  scopes: ScopedSettings,
  marketplaceName: string,
  marketplace: Marketplace,
): MigratedScopes {
  const out: { [S in InstallScope]?: Readonly<Record<string, unknown>> } = {};
  const notices = new Set<string>();
  for (const scope of INSTALL_SCOPES) {
    const given = scopes[scope];
    if (given === undefined) continue;
    const migrated = migrateSettingsKeys(given, marketplaceName, marketplace);
    out[scope] = isWritableScope(scope) ? migrated.map : given;
    for (const notice of migrated.notices) notices.add(notice);
  }
  return { scopes: out, notices: [...notices] };
}
