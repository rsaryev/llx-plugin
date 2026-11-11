import { parseFrontmatter, type Frontmatter } from './frontmatter.ts';
import { error, warning, type PluginIssue } from './issues.ts';
import { COMMAND_ENTRY_ONE_OF, type CommandEntry } from './manifest-schema.ts';
import { readInvocable } from './skill-fields.ts';
import { pluginPrefix, refusedCharacters, reservedNamespace } from './skill-name.ts';
import type { Command, InvocableFrontmatter, SkillOrigin } from './skill-types.ts';

/**
 * Commands, "the older format" (plugins/components.md, "Commands"; skills.md, "Where skills
 * live"): a flat Markdown file that "takes the same frontmatter as skills" except `name` and
 * `paths`, or an entry of the manifest's `commands` object map (plugins/manifest-reference.md,
 * "commands"). Never throws; a refused command is an error issue and no command.
 */

export interface CommandRead {
  /** Absent when the command is refused: an error issue says why. */
  readonly command?: Command;
  readonly issues: readonly PluginIssue[];
}

export interface CommandLayout {
  readonly origin: SkillOrigin;
  /** The file's path below its `commands` folder, `/`-separated, with its extension: `db/migrate.md`. */
  readonly relativePath: string;
}

export interface CommandEntryContext {
  readonly origin: SkillOrigin;
}

/** What a command is read from: its frontmatter fields and its body. */
type Parsed = Pick<Frontmatter, 'fields' | 'body'> & Partial<Pick<Frontmatter, 'problem' | 'line'>>;

/** Skills.md: a command file "accepts the same fields except `name` and `paths`". */
const NOT_TAKEN: readonly string[] = ['name', 'paths'];

/** The name's segments: a path's folders and file, or an entry's key, joined by `:` in the name. */
const SEGMENT = ':';

/**
 * Whether Claude Code loads a command of this name (skills.md, "Characters a skill name can't
 * hold", "Names reserved for synced skills"): "A custom command or skill doesn't load when Claude
 * Code refuses its directory or file name". The same refusal applies to a manifest key, the "command
 * name" the docs say is refused (judgment: the docs name no other rule for a key). `anthropic-skills`
 * is reserved for synced skills; "a plugin named `anthropic-skills`: it loads", so a plugin command
 * is not refused for it.
 */
export function commandNameIssues(
  at: string,
  segments: readonly string[],
  origin: SkillOrigin,
): readonly PluginIssue[] {
  const name = segments.join(SEGMENT);
  if (segments.some((segment) => segment === '')) {
    return [error(at, `command name "${name}" has an empty part; the command is refused`)];
  }
  const found = segments.flatMap(refusedCharacters);
  if (found.length > 0) {
    return [
      error(
        at,
        `command name has a character a command name can't hold (${found.join(', ')}); the command is refused, rename it`,
      ),
    ];
  }
  const reserved = 'plugin' in origin ? undefined : reservedNamespace(name);
  return reserved === undefined
    ? []
    : [
        error(
          at,
          `command name uses "${reserved}", a name reserved for skills synced from claude.ai; the command does not load, rename it`,
        ),
      ];
}

const parseProblem = (path: string, parsed: Parsed): PluginIssue[] => {
  if (parsed.problem === undefined) return [];
  const where = parsed.line === undefined ? '' : ` (line ${parsed.line})`;
  return [
    warning(
      path,
      `frontmatter ${parsed.problem}${where}; the command loads with its body and no fields set`,
    ),
  ];
};

interface Where {
  /** What an issue about the fields is reported against: the file, or the entry. */
  readonly path: string;
  /** What an issue about the name is reported against. */
  readonly namePath: string;
  readonly segments: readonly string[];
  readonly origin: SkillOrigin;
  readonly file?: string;
}

/** Name, fields and body into a `Command`; a refused name gives no command. */
function assemble(
  where: Where,
  parsed: Parsed,
  overlay: Partial<InvocableFrontmatter> = {},
): CommandRead {
  const refused = commandNameIssues(where.namePath, where.segments, where.origin);
  if (refused.length > 0) return { issues: refused };
  const { frontmatter, problems } = readInvocable(parsed.fields, parsed.body, NOT_TAKEN);
  const issues = [
    ...parseProblem(where.path, parsed),
    ...problems.map((found) => warning(where.path, `${found.key} ${found.reason}`)),
  ];
  const name = where.segments.join(SEGMENT);
  return {
    command: {
      ...frontmatter,
      ...overlay,
      kind: 'command',
      name,
      command: `${pluginPrefix(where.origin)}${name}`,
      origin: where.origin,
      ...(where.file === undefined ? {} : { path: where.file }),
      body: parsed.body,
    },
    issues,
  };
}

const withoutExtension = (file: string): string => file.replace(/\.md$/i, '');

/**
 * Read a command file. The name is its path below `commands/` without the extension, the folders
 * joined by `:` (`db/migrate.md` is `db:migrate`), after the plugin prefix for a plugin's file.
 */
export function readCommand(path: string, text: string, layout: CommandLayout): CommandRead {
  const segments = withoutExtension(layout.relativePath).split('/');
  return assemble(
    { path, namePath: path, segments, origin: layout.origin, file: path },
    parseFrontmatter(text),
  );
}

const present = (text: string | undefined): string | undefined => {
  const trimmed = text?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
};

/**
 * The fields an entry sets. Judgment (spec/judgments.md): a field the entry sets replaces the same
 * field of its `source` file's frontmatter; the docs do not say which wins.
 */
function overlayOf(entry: CommandEntry): Partial<InvocableFrontmatter> {
  const description = present(entry.description);
  const argumentHint = present(entry.argumentHint);
  const model = present(entry.model);
  return {
    ...(description === undefined ? {} : { description }),
    ...(argumentHint === undefined ? {} : { argumentHint }),
    ...(model === undefined ? {} : { model }),
    ...(entry.allowedTools === undefined
      ? {}
      : { allowedTools: entry.allowedTools.flatMap((rule) => present(rule) ?? []) }),
  };
}

/** The entry's body and fields: the inline content as written, or the file's text parsed. */
function entryParsed(entry: CommandEntry, sourceText: string | undefined): Parsed | undefined {
  if (entry.content !== undefined) return { fields: {}, body: entry.content };
  return sourceText === undefined ? undefined : parseFrontmatter(sourceText);
}

/**
 * Build a `Command` from one entry of the manifest's `commands` map. `key` is the command name
 * after the plugin prefix. `sourceText` is the text of the entry's `source` file, `undefined` when
 * the file is not there. Exactly one of `source` and `content` must be set (the manifest says an
 * entry with both or neither "fails validation"). Judgment (spec/judgments.md): `content` is the
 * body as written, not parsed for frontmatter ("Inline Markdown for the command body").
 */
export function readCommandEntry(
  key: string,
  entry: CommandEntry,
  sourceText: string | undefined,
  ctx: CommandEntryContext,
): CommandRead {
  const at = `commands.${key}`;
  if ((entry.source === undefined) === (entry.content === undefined)) {
    return { issues: [error(at, COMMAND_ENTRY_ONE_OF)] };
  }
  const parsed = entryParsed(entry, sourceText);
  if (parsed === undefined) {
    return {
      issues: [error(at, `source "${entry.source}" was not found in the plugin folder`)],
    };
  }
  const where: Where = {
    path: entry.source ?? at,
    namePath: at,
    segments: [key],
    origin: ctx.origin,
    ...(entry.source === undefined ? {} : { file: entry.source }),
  };
  return assemble(where, parsed, overlayOf(entry));
}
