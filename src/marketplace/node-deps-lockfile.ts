import {
  DEPENDENCY_SECTIONS,
  isRegistryId,
  isRegistryOrigin,
  readDependencyMap,
  type DependencyMap,
  type DependencySection,
} from './node-deps-spec.ts';

/**
 * The facts of a lockfile the dependency install checks (plugins/loading.md, "Limits on the
 * dependency install": a registry package "pinned in the lockfile to an exact version", an `https`
 * download link, the same dependencies in `package.json` and the lockfile; "When the dependency
 * install runs": `lockfileVersion`). The docs name only `lockfileVersion`; the rest of each layout
 * is npm's and Bun's own and is read as little as the checks need (spec/judgments.md).
 */

/** The lockfiles the install reads, in the order Claude Code checks them: "the first match". */
export const LOCKFILE_NAMES = ['bun.lock', 'npm-shrinkwrap.json', 'package-lock.json'] as const;
export type LockfileName = (typeof LOCKFILE_NAMES)[number];

/** A package the lockfile pins to something other than a registry version. */
export interface LockedOrigin {
  readonly name: string;
  /** What it is pinned to, in the specifier forms of `package.json` (`link:../a`, `git+ssh://...`). */
  readonly origin: string;
}

export type RootDependencies = { readonly [S in DependencySection]?: DependencyMap };

export interface LockfileFacts {
  /** `lockfileVersion`; `undefined` when the file is not readable or has none. */
  readonly version: number | undefined;
  /** What the lockfile records the root package as depending on. */
  readonly root: RootDependencies;
  /** Packages pinned to a non-registry origin. */
  readonly locked: readonly LockedOrigin[];
  /** Every download link the lockfile holds, whatever its scheme. */
  readonly downloads: readonly string[];
  /** Registry packages not pinned to an exact version, each as `name@version` (the name alone when none is given). */
  readonly unpinned: readonly string[];
}

const UNREADABLE: LockfileFacts = {
  version: undefined,
  root: {},
  locked: [],
  downloads: [],
  unpinned: [],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function rootOf(entry: unknown): RootDependencies {
  if (!isRecord(entry)) return {};
  return Object.fromEntries(
    DEPENDENCY_SECTIONS.flatMap((section) => {
      const map = readDependencyMap(entry[section]);
      return Object.keys(map).length === 0 ? [] : [[section, map]];
    }),
  );
}

const versionOf = (parsed: Record<string, unknown>): number | undefined =>
  typeof parsed.lockfileVersion === 'number' ? parsed.lockfileVersion : undefined;

interface Found {
  readonly locked: LockedOrigin[];
  readonly downloads: string[];
  readonly unpinned: string[];
}

const nothingFound = (): Found => ({ locked: [], downloads: [], unpinned: [] });

/** An exact version: `1.3.0`, `2.0.0-beta.1`, `1.0.0+build`; not a range, a tag or a link. */
const EXACT = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const pinnedLabel = (name: string, version: unknown): string =>
  typeof version === 'string' ? `${name}@${version}` : name;

// ---- npm ----

const MODULES = 'node_modules/';

/** `node_modules/a/node_modules/@s/b` is the package `@s/b`. */
const npmNameOf = (key: string): string => key.slice(key.lastIndexOf(MODULES) + MODULES.length);

/**
 * An npm entry is a locked origin (a link, or a `resolved` that is no registry download), else a
 * download link of any scheme, whose `https` is checked later; a registry entry must carry an
 * exact `version`.
 */
function placeNpm(key: string, entry: Record<string, unknown>, into: Found): void {
  const name = npmNameOf(key);
  if (entry.link === true) {
    into.locked.push({
      name,
      origin: `link:${typeof entry.resolved === 'string' ? entry.resolved : ''}`,
    });
    return;
  }
  if (typeof entry.resolved === 'string') {
    if (isRegistryOrigin(entry.resolved)) into.downloads.push(entry.resolved);
    else into.locked.push({ name, origin: entry.resolved });
  }
  if (typeof entry.version !== 'string' || !EXACT.test(entry.version)) {
    into.unpinned.push(pinnedLabel(name, entry.version));
  }
}

function readNpm(parsed: Record<string, unknown>): LockfileFacts {
  const packages = isRecord(parsed.packages) ? parsed.packages : {};
  const into = nothingFound();
  for (const [key, entry] of Object.entries(packages)) {
    if (key !== '' && isRecord(entry)) placeNpm(key, entry, into);
  }
  return { version: versionOf(parsed), root: rootOf(packages['']), ...into };
}

// ---- bun.lock ----

/** `bun.lock` is JSON with trailing commas; drop each comma that closes an object or an array. */
function withoutTrailingCommas(text: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);
    const closes = !inString && char === ',' && /^\s*[}\]]/.test(text.slice(index + 1));
    if (!closes) out += char;
    if (inString) {
      inString = escaped || char !== '"';
      escaped = !escaped && char === '\\';
    } else {
      inString = char === '"';
    }
  }
  return out;
}

/** `name@spec` where a scoped name starts with `@`. */
function splitId(id: string): { name: string; spec: string } | undefined {
  const at = id.indexOf('@', 1);
  return at === -1 ? undefined : { name: id.slice(0, at), spec: id.slice(at + 1) };
}

/**
 * A `bun.lock` id is `name@specifier`: a registry package when the specifier is a registry version
 * (or an `npm:` alias), which must be exact; anything else, a tarball link included, is a locked
 * origin. Only the entry's registry URL is a download link.
 */
function placeBun(entry: readonly unknown[], into: Found): void {
  const id = typeof entry[0] === 'string' ? splitId(entry[0]) : undefined;
  if (id !== undefined && !isRegistryId(id.spec))
    into.locked.push({ name: id.name, origin: id.spec });
  else if (id !== undefined && !EXACT.test(id.spec.slice(id.spec.lastIndexOf('@') + 1))) {
    into.unpinned.push(`${id.name}@${id.spec}`);
  }
  if (typeof entry[1] === 'string' && entry[1] !== '') into.downloads.push(entry[1]);
}

function readBun(parsed: Record<string, unknown>): LockfileFacts {
  const workspaces = isRecord(parsed.workspaces) ? parsed.workspaces : {};
  const packages = isRecord(parsed.packages) ? parsed.packages : {};
  const into = nothingFound();
  for (const entry of Object.values(packages)) {
    if (Array.isArray(entry)) placeBun(entry, into);
  }
  return { version: versionOf(parsed), root: rootOf(workspaces['']), ...into };
}

interface Reader {
  readonly prepare: (text: string) => string;
  readonly read: (parsed: Record<string, unknown>) => LockfileFacts;
}

const READERS: { readonly [N in LockfileName]: Reader } = {
  'bun.lock': { prepare: withoutTrailingCommas, read: readBun },
  'npm-shrinkwrap.json': { prepare: (text) => text, read: readNpm },
  'package-lock.json': { prepare: (text) => text, read: readNpm },
};

/** The facts of a lockfile's text; text that is not JSON has no version, so no install runs from it. */
export function readLockfile(name: LockfileName, text: string): LockfileFacts {
  const reader = READERS[name];
  try {
    const parsed: unknown = JSON.parse(reader.prepare(text));
    return isRecord(parsed) ? reader.read(parsed) : UNREADABLE;
  } catch {
    return UNREADABLE;
  }
}
