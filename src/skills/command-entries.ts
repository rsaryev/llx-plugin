import { readCommandEntry, type CommandEntryContext } from '../format/command.ts';
import { error, warning, type PluginIssue } from '../format/issues.ts';
import type { CommandEntry } from '../format/manifest-schema.ts';
import { escapedPathIssue } from '../format/path-escape.ts';
import type { Command } from '../format/skill-types.ts';
import type { PluginFiles } from '../ports/index.ts';
import { parseRule } from '../rules/parse.ts';

/**
 * The manifest's `commands` object map (plugins/manifest-reference.md, "commands"; plugins/
 * components.md, "Define commands in the manifest"): each entry becomes a command named after the
 * plugin prefix and its key, with its body from inline `content` or from the `source` file, read
 * through the `PluginFiles` port. An entry that cannot load is an error issue and the others still
 * load: a plugin error is a value, never a throw.
 */

export interface CommandEntriesLoaded {
  /** In the map's key order. */
  readonly commands: readonly Command[];
  readonly issues: readonly PluginIssue[];
}

export interface Grants {
  readonly rules: readonly string[];
  readonly issues: readonly PluginIssue[];
}

/**
 * The rules of `allowedTools` that parse as permission rules (permissions.md, "Permission rule
 * syntax"), as written. Judgment (spec/judgments.md): a rule that does not parse is dropped with a
 * warning and grants nothing, and the command still loads; a grant is read like a session rule.
 */
export function commandEntryGrants(key: string, rules: readonly string[]): Grants {
  const kept: string[] = [];
  const issues: PluginIssue[] = [];
  for (const rule of rules) {
    const parsed = parseRule(rule, { behavior: 'allow', source: { kind: 'session' } });
    if (parsed.rule !== undefined) kept.push(rule);
    issues.push(
      ...parsed.issues.map((found) =>
        warning(`commands.${key}.allowedTools`, `${found.message} (the rule grants nothing)`),
      ),
    );
  }
  return { rules: kept, issues };
}

interface Loaded {
  readonly command?: Command;
  readonly issues: readonly PluginIssue[];
}

/**
 * `source` as a path of the plugin folder: a manifest path must start with `./` and hold no `..`
 * ("Path rules"), which also keeps a read inside the folder. Judgment (spec/judgments.md): the
 * port gets the path without the `./`, and an entry whose source breaks the rules loads nothing.
 */
const portPath = (source: string): string => source.replace(/^(\.\/)+/, '');

/**
 * What refuses a `source`: no `./` start, or a path that leaves the plugin as written (`..`, an
 * absolute path, a backslash). Judgment: judged as on macOS and Linux, since the port takes `/` paths.
 */
const sourceIssues = (source: string, field: string): PluginIssue[] => [
  ...(source.startsWith('./')
    ? []
    : [error(field, `${field} path must start with "./": ${source}`)]),
  ...[escapedPathIssue({ component: field, written: source, platform: 'posix' })].filter(
    (issue) => issue !== undefined,
  ),
];

interface Reader {
  readonly files: PluginFiles;
  readonly ctx: CommandEntryContext;
  readonly signal: AbortSignal;
}

/** The `source` file's text, or `undefined` for an entry that reads none; a refused path is an issue. */
type Source = { readonly refused: readonly PluginIssue[] } | { readonly text: string | undefined };

async function readSource(key: string, entry: CommandEntry, reader: Reader): Promise<Source> {
  const { source } = entry;
  if (source === undefined || entry.content !== undefined) return { text: undefined };
  const refused = sourceIssues(source, `commands.${key}.source`);
  if (refused.length > 0) return { refused };
  return { text: await reader.files.readText(portPath(source), reader.signal) };
}

async function loadEntry(key: string, entry: CommandEntry, reader: Reader): Promise<Loaded> {
  const grants =
    entry.allowedTools === undefined ? undefined : commandEntryGrants(key, entry.allowedTools);
  const checked: CommandEntry =
    grants === undefined ? entry : { ...entry, allowedTools: [...grants.rules] };
  const source = await readSource(key, entry, reader);
  if ('refused' in source) return { issues: source.refused };
  const read = readCommandEntry(key, checked, source.text, reader.ctx);
  return {
    ...(read.command === undefined ? {} : { command: read.command }),
    issues: [...(grants?.issues ?? []), ...read.issues],
  };
}

/**
 * Load every entry of a `commands` object map. `files` is the plugin folder; a `source` is read
 * from it only when the entry sets `source` alone.
 */
export async function loadCommandEntries(
  map: Readonly<Record<string, CommandEntry>>,
  files: PluginFiles,
  ctx: CommandEntryContext,
  { signal }: { readonly signal: AbortSignal },
): Promise<CommandEntriesLoaded> {
  const loaded = await Promise.all(
    Object.entries(map).map(([key, entry]) => loadEntry(key, entry, { files, ctx, signal })),
  );
  return {
    commands: loaded.flatMap((one) => (one.command === undefined ? [] : [one.command])),
    issues: loaded.flatMap((one) => one.issues),
  };
}
