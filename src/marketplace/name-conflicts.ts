/**
 * Which plugin loads when enabled plugins from different origins share a manifest name
 * (plugins/loading.md, "Name conflicts", "Hooks when two enabled plugins share a name", "Keep a
 * session-only plugin from loading"). Pure over what the host found. The rows and messages the docs
 * quote are the docs'; the wording of the rest is the kit's (spec/judgments.md).
 */

export type PluginOrigin = 'session-only' | 'installed' | 'skills-dir' | 'synced';

export interface NameCandidate {
  /** `name@marketplace`, `name@inline`, `name@skills-dir`. */
  readonly id: string;
  /** The manifest name every copy of the conflict shares. */
  readonly name: string;
  readonly origin: PluginOrigin;
  /** Enabled in the settings that apply; `"<id>": false` disables a session-only plugin too. */
  readonly enabled: boolean;
  /** The id appears in managed settings `enabledPlugins`, as `true` or `false`. */
  readonly managedLocked?: boolean;
  /** A skills-directory plugin's scope and path, to say which copy shadowed which. */
  readonly skillsDir?: { readonly scope: 'user' | 'project'; readonly path: string };
}

export interface NameVerdict {
  readonly id: string;
  readonly loads: boolean;
  /** The row of the `/plugin` **Errors** tab, or the line printed, for a copy that did not load. */
  readonly note?: string;
  /** Recorded only by the `--debug` log: the installed copy a session-only plugin replaced silently. */
  readonly debugLog?: string;
}

/** Highest precedence first: managed, session-only, installed, skills-directory, synced. */
const RANK: { readonly [O in PluginOrigin]: number } = {
  'session-only': 1,
  installed: 2,
  'skills-dir': 3,
  synced: 4,
};
const MANAGED_RANK = 0;

const rankOf = (candidate: NameCandidate): number =>
  candidate.managedLocked === true ? MANAGED_RANK : RANK[candidate.origin];

/** "The copy under `~/.claude/skills/` loads and the project's `.claude/skills/` copy is dropped." */
const SCOPE_ORDER: { readonly [S in 'user' | 'project']: number } = { user: 0, project: 1 };
const scopeRank = (candidate: NameCandidate): number =>
  candidate.skillsDir === undefined ? 0 : SCOPE_ORDER[candidate.skillsDir.scope];

const SESSION_FLAGS = '--plugin-dir / --plugin-url';

type LoserNote = (loser: NameCandidate, winner: NameCandidate) => Partial<NameVerdict>;

/** What a copy that lost says, by where it came from. */
const LOSER: { readonly [O in PluginOrigin]: LoserNote } = {
  'session-only': (loser, winner) =>
    winner.managedLocked === true
      ? {
          note: `--plugin-dir copy of "${loser.name}" ignored: plugin is locked by managed settings`,
        }
      : {},
  installed: (loser, winner) =>
    winner.origin === 'session-only'
      ? { debugLog: `Plugin "${loser.name}" from --plugin-dir overrides installed version` }
      : {},
  'skills-dir': (loser, winner) => ({
    note:
      winner.origin === 'session-only'
        ? `Not loaded — the name "${loser.name}" is already taken by a session-only plugin (${SESSION_FLAGS}), which takes precedence`
        : winner.origin === 'skills-dir'
          ? `Not loaded — shadowed by ${winner.skillsDir?.path ?? winner.id}`
          : `Not loaded — the name "${loser.name}" is already taken by the installed plugin ${winner.id}`,
  }),
  synced: (loser, winner) => ({
    note: `Not loaded — the name "${loser.name}" is already taken by ${winner.id}. To use the claude.ai copy instead, disable your own copy`,
  }),
};

/**
 * The copy of a name that loads and what each other copy reports. A disabled copy never holds the name
 * ("A disabled session-only plugin doesn't shadow"), except that a managed-locked id keeps a
 * `--plugin-dir` copy of its name out even when its value is `false`.
 */
export function resolveNameConflict(candidates: readonly NameCandidate[]): readonly NameVerdict[] {
  const locked = candidates.find((candidate) => candidate.managedLocked === true);
  const eligible = candidates.filter(
    (candidate) =>
      candidate.enabled && !(candidate.origin === 'session-only' && locked !== undefined),
  );
  const winner = [...eligible].sort(
    (a, b) => rankOf(a) - rankOf(b) || scopeRank(a) - scopeRank(b),
  )[0];
  return candidates.map((candidate) => {
    if (candidate === winner) return { id: candidate.id, loads: true };
    const keptOut = candidate.origin === 'session-only' && locked !== undefined;
    const holder = keptOut ? locked : winner;
    const reports = holder !== undefined && (candidate.enabled || keptOut);
    return {
      id: candidate.id,
      loads: false,
      ...(reports ? LOSER[candidate.origin](candidate, holder) : {}),
    };
  });
}

/** One copy of a plugin name that declares hooks. */
export interface HookCopy {
  readonly id: string;
  /** Managed settings turn this copy on. */
  readonly managedEnabled: boolean;
  /** The order Claude Code loads the copies in. */
  readonly loadOrder: number;
  readonly hooksJson: boolean;
  readonly hooksModule: boolean;
}

export interface HookNote {
  readonly id: string;
  readonly kind: 'hooks.json' | 'hooks module';
  /** The note of the **Errors** tab and of the copy's details. */
  readonly message: string;
}

const NOTE_START: { readonly [K in HookNote['kind']]: string } = {
  'hooks.json': 'Its hooks.json hooks do not run',
  'hooks module': 'Its hooks module does not load',
};

/** "When your organization's managed settings turn on one of the copies, that copy holds the name. Otherwise the copy Claude Code loads first holds it." */
export function nameHolder(copies: readonly HookCopy[]): HookCopy | undefined {
  const managed = copies.filter((copy) => copy.managedEnabled);
  const pool = managed.length > 0 ? managed : copies;
  return [...pool].sort((a, b) => a.loadOrder - b.loadOrder)[0];
}

/** The notes for the copies whose hooks are left out; one plugin per name registers `hooks/hooks.json` hooks and one loads a hooks module. */
export function hookConflictNotes(copies: readonly HookCopy[]): readonly HookNote[] {
  const holder = nameHolder(copies);
  if (holder === undefined) return [];
  const kinds: readonly HookNote['kind'][] = ['hooks.json', 'hooks module'];
  return copies
    .filter((copy) => copy !== holder)
    .flatMap((copy) =>
      kinds
        .filter((kind) => (kind === 'hooks.json' ? copy.hooksJson : copy.hooksModule))
        .filter((kind) => (kind === 'hooks.json' ? holder.hooksJson : holder.hooksModule))
        .map((kind) => ({
          id: copy.id,
          kind,
          message: `${NOTE_START[kind]}: ${holder.id} holds the name`,
        })),
    );
}

/** `--plugin-dir` plugin ids are `<name>@inline`: the entry that keeps one from loading. */
export const sessionOnlyOffEntry = (name: string): Readonly<Record<string, false>> => ({
  [`${name}@inline`]: false,
});

/** Disabling the holder (a copy managed settings do not turn on) and reloading registers the remaining copy's hooks. */
export function afterDisabling(
  copies: readonly HookCopy[],
  disabledId: string,
): { readonly allowed: boolean; readonly notes: readonly HookNote[] } {
  const target = copies.find((copy) => copy.id === disabledId);
  if (target?.managedEnabled === true) return { allowed: false, notes: hookConflictNotes(copies) };
  return {
    allowed: true,
    notes: hookConflictNotes(copies.filter((copy) => copy.id !== disabledId)),
  };
}
