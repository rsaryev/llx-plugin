import {
  classifySpecifier,
  DEPENDENCY_SECTIONS,
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

export type LockfileName = 'bun.lock' | 'npm-shrinkwrap.json' | 'package-lock.json';

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
  /** Every download link the lockfile holds. */
  readonly downloads: readonly string[];
}

const UNREADABLE: LockfileFacts = { version: undefined, root: {}, locked: [], downloads: [] };

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
}

const nothingFound = (): Found => ({ locked: [], downloads: [] });

/** Sorts one origin into a download link or a locked non-registry origin. */
function place(name: string, origin: string, into: Found): void {
  if (!isRegistryOrigin(origin)) into.locked.push({ name, origin });
  else if (classifySpecifier(origin) !== 'registry') into.downloads.push(origin);
}

// ---- npm ----

const MODULES = 'node_modules/';

/** `node_modules/a/node_modules/@s/b` is the package `@s/b`. */
const npmNameOf = (key: string): string => key.slice(key.lastIndexOf(MODULES) + MODULES.length);

function readNpm(parsed: Record<string, unknown>): LockfileFacts {
  const packages = isRecord(parsed.packages) ? parsed.packages : {};
  const into = nothingFound();
  for (const [key, entry] of Object.entries(packages)) {
    if (key === '' || !isRecord(entry) || typeof entry.resolved !== 'string') continue;
    const name = npmNameOf(key);
    if (entry.link === true) into.locked.push({ name, origin: `link:${entry.resolved}` });
    else place(name, entry.resolved, into);
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

function readBun(parsed: Record<string, unknown>): LockfileFacts {
  const workspaces = isRecord(parsed.workspaces) ? parsed.workspaces : {};
  const packages = isRecord(parsed.packages) ? parsed.packages : {};
  const into = nothingFound();
  for (const entry of Object.values(packages)) {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string') continue;
    const id = splitId(entry[0]);
    if (id !== undefined) place(id.name, id.spec, into);
    if (typeof entry[1] === 'string' && entry[1] !== '') into.downloads.push(entry[1]);
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
