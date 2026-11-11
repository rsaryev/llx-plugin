import type { BodyReader, InvocableHead, SkillHead } from '../../format/skill-types.ts';
import { SCOPE_RULES, type ScanScope } from './locations.ts';
import { foldName, relativeBelow, segmentsOf } from './names.ts';
import type { ScannedEntry } from './scan-types.ts';

/**
 * Which skill a name runs when several share it (skills.md, "Resolve skills that share a name", "How
 * a skill gets its command name", "Run a same-named skill from an added directory", "When a synced
 * skill name matches another command"). The scans of every scope go in, the skills and commands a
 * session lists come out, each with the names that invoke it.
 *
 * Every scope has a naming strategy in one registry typed over the scopes: the names it prefers, the
 * names it falls back to when none of those is free, and whether names are compared as the synced
 * skills' are (ignoring case, spacing and invisible characters).
 */

/** Who holds a name: a skill or command file of the folders, or (absent) another source of commands. */
export interface NameHolder {
  readonly scope: ScanScope;
  readonly path: string | undefined;
}

/** A name an entry would have liked and did not get, and who has it (skills.md, "When a synced skill name matches another command"). */
export interface YieldedName {
  readonly name: string;
  /** The folder skill or command file that uses it; absent for a built-in command, a plugin skill or an MCP prompt. */
  readonly heldBy: NameHolder | undefined;
}

export interface ResolvedFolderSkill {
  /** The skill or command, without its body, with its listed command (`/apps/web:deploy`, `/cli:verify`). */
  readonly invocable: InvocableHead;
  /** Reads its body when it runs (`ScannedEntry.readBody`). */
  readonly readBody: BodyReader;
  readonly scope: ScanScope;
  /** Every name that invokes it, the listed command first. */
  readonly names: readonly string[];
  /** The names it prefers that another command already used: a synced skill that lost its short name lists it here. */
  readonly yielded: readonly YieldedName[];
}

/** An entry that lost its name to another, for a host that wants to say so. */
export interface ShadowedEntry {
  readonly scope: ScanScope;
  readonly command: string;
  readonly path: string | undefined;
}

export interface Resolution {
  readonly resolved: readonly ResolvedFolderSkill[];
  readonly shadowed: readonly ShadowedEntry[];
}

export interface ResolveFolderOptions {
  /** The working directory the nested skills' qualified names are relative to. */
  readonly cwd: string;
  /** The added directories, in order: their folder names prefix a clashing skill. */
  readonly addedDirectories?: readonly string[];
  /**
   * Commands other sources already use: built-in commands, bundled skills, plugin skills, MCP
   * prompts. Only a synced skill's short name yields to them.
   */
  readonly taken?: Iterable<string>;
}

interface Naming {
  readonly preferred: readonly string[];
  readonly fallback: readonly string[];
  /** Compare as synced skills do: case, spacing, invisible characters and compatibility forms ignored. */
  readonly folded: boolean;
}

interface NamingContext {
  readonly options: ResolveFolderOptions;
  readonly prefixes: ReadonlyMap<string, string>;
}

const isSkill = (invocable: InvocableHead): invocable is SkillHead => 'dir' in invocable;

const unique = (names: readonly string[]): readonly string[] => [...new Set(names)];

/** `deploy` by its frontmatter `name` or by its folder: both invoke a skill in a folder scope. */
const ownNames = (entry: ScannedEntry): Naming => ({
  preferred: unique([entry.invocable.command, entry.dirName]),
  fallback: [],
  folded: false,
});

const NAMING: {
  readonly [S in ScanScope]: (entry: ScannedEntry, context: NamingContext) => Naming;
} = {
  managed: ownNames,
  user: ownNames,
  project: ownNames,
  nested: (entry, { options }) => ({
    ...ownNames(entry),
    fallback: [`${relativeBelow(options.cwd, entry.base)}:${entry.dirName}`],
  }),
  additional: (entry, { prefixes }) => ({
    ...ownNames(entry),
    // Only a skill gets the prefix: a command of an added directory "runs your project's command" instead
    // (permissions.md, "Additional directories grant file access, not configuration").
    fallback: isSkill(entry.invocable)
      ? [`${prefixes.get(entry.base) ?? entry.base}:${entry.dirName}`]
      : [],
  }),
  synced: (entry) => {
    const short = isSkill(entry.invocable) ? entry.invocable.name : entry.invocable.command;
    return { preferred: [short, entry.invocable.command], fallback: [], folded: true };
  },
};

/**
 * The names in use, exactly and folded. The commands other sources use (`taken`) count for a synced
 * skill's short name only: a skill of the folders replaces a built-in command of its name (skills.md,
 * "Resolve skills that share a name").
 */
class Claims {
  readonly #exact = new Map<string, NameHolder>();
  readonly #folded = new Map<string, NameHolder | undefined>();

  constructor(others: Iterable<string>) {
    for (const name of others) this.#folded.set(foldName(name), undefined);
  }

  add(name: string, holder: NameHolder): void {
    this.#exact.set(name, holder);
    this.#folded.set(foldName(name), holder);
  }

  free(name: string, folded: boolean): boolean {
    return folded ? !this.#folded.has(foldName(name)) : !this.#exact.has(name);
  }

  /** Who uses the name; `undefined` for a name nobody has and for one only another source of commands has. */
  holder(name: string, folded: boolean): NameHolder | undefined {
    return folded ? this.#folded.get(foldName(name)) : this.#exact.get(name);
  }
}

/**
 * The prefix of each added directory: its folder's name; when two share one, the parent's name
 * before it (`b/cli`), with more parents only while they still match (judgment: the docs name the
 * parent only).
 */
function prefixesOf(directories: readonly string[]): ReadonlyMap<string, string> {
  const parts = directories.map((directory) => segmentsOf(directory));
  const prefix = (index: number, depth: number): string =>
    (parts[index] ?? []).slice(-depth).join('/');
  const found = new Map<string, string>();
  for (const [index, directory] of directories.entries()) {
    let depth = 1;
    const clashes = (): boolean =>
      directories.some(
        (_other, at) =>
          at !== index &&
          parts[at]?.join('/') !== parts[index]?.join('/') &&
          prefix(at, depth) === prefix(index, depth),
      );
    while (clashes() && depth < (parts[index]?.length ?? 0)) depth += 1;
    found.set(directory, prefix(index, depth));
  }
  return found;
}

const withCommand = (invocable: InvocableHead, command: string): InvocableHead => ({
  ...invocable,
  command,
});

/** Nested skills that took a qualified name say which directory they apply to (skills.md, "Load skills in monorepos"). */
function qualified(invocable: InvocableHead, directory: string): InvocableHead {
  const note = `applies to ${directory}`;
  const { description } = invocable;
  return {
    ...invocable,
    description: description === undefined ? note : `${description} (${note})`,
  };
}

interface Placed {
  readonly resolved?: ResolvedFolderSkill;
  readonly shadowed?: ShadowedEntry;
}

function place(entry: ScannedEntry, claims: Claims, context: NamingContext): Placed {
  const naming = NAMING[entry.scope](entry, context);
  const free = (name: string) => claims.free(name, naming.folded);
  let names = naming.preferred.filter(free);
  const yielded = naming.preferred
    .filter((name) => !free(name))
    .map((name) => ({ name, heldBy: claims.holder(name, naming.folded) }));
  const usedFallback = names.length === 0;
  if (usedFallback) names = naming.fallback.filter(free).slice(0, 1);
  const [command] = names;
  if (command === undefined) {
    return {
      shadowed: {
        scope: entry.scope,
        command: entry.invocable.command,
        path: entry.invocable.path,
      },
    };
  }
  const holder: NameHolder = { scope: entry.scope, path: entry.invocable.path };
  for (const name of names) claims.add(name, holder);
  const base = withCommand(entry.invocable, command);
  const invocable = usedFallback ? qualifiedNote(base, entry, context) : base;
  return { resolved: { invocable, readBody: entry.readBody, scope: entry.scope, names, yielded } };
}

const qualifiedNote = (
  invocable: InvocableHead,
  entry: ScannedEntry,
  context: NamingContext,
): InvocableHead =>
  isSkill(invocable) && entry.scope === 'nested'
    ? qualified(invocable, relativeBelow(context.options.cwd, entry.base))
    : invocable;

/** Skills of the folder scopes first, then command files (a skill wins over a command), then synced skills. */
function inPhases(entries: readonly ScannedEntry[]): readonly ScannedEntry[] {
  const ranked = entries.toSorted((a, b) => SCOPE_RULES[a.scope].rank - SCOPE_RULES[b.scope].rank);
  const synced = (entry: ScannedEntry): boolean => entry.scope === 'synced';
  const local = ranked.filter((entry) => !synced(entry));
  return [
    ...local.filter((entry) => isSkill(entry.invocable)),
    ...local.filter((entry) => !isSkill(entry.invocable)),
    ...ranked.filter(synced),
  ];
}

/** One entry per real target: the same folder reached through several links loads once. */
function oncePerTarget(entries: readonly ScannedEntry[]): readonly ScannedEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (entry.canonical === undefined) return true;
    const key = `${isSkill(entry.invocable) ? 'skill' : 'command'}:${entry.canonical}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function resolveFolderSkills(
  scanned: readonly ScannedEntry[],
  options: ResolveFolderOptions,
): Resolution {
  const claims = new Claims(options.taken ?? []);
  const context: NamingContext = {
    options,
    prefixes: prefixesOf(options.addedDirectories ?? []),
  };
  const placed = inPhases(oncePerTarget(scanned)).map((entry) => place(entry, claims, context));
  return {
    resolved: placed.flatMap((each) => each.resolved ?? []),
    shadowed: placed.flatMap((each) => each.shadowed ?? []),
  };
}
