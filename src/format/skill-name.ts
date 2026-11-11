import { error, warning, type PluginIssue } from './issues.ts';
import type { SkillLayout, SkillOrigin, SkillOriginKind } from './skill-types.ts';

/**
 * How a skill gets its command name (skills.md, "How a skill gets its command name" and
 * "Characters a skill name can't hold"; plugins/components.md, "Skills").
 */

export interface SkillName {
  /** The name the skill goes by: the frontmatter `name`, else the folder's name. */
  readonly name: string;
  /** What the user types after `/`. */
  readonly command: string;
  /**
   * `path` is the field the issue is about: `name` (the frontmatter) or `folder`. A message is a
   * whole sentence that already starts with the field (`folder name has ...`), so a host shows it
   * as it is. An error means the skill is refused and does not load; a warning means it loads.
   */
  readonly issues: readonly PluginIssue[];
}

/**
 * Characters "such as" those the docs list: a zero-width space or a control character (Cc, and
 * the zero-width and bidi controls, which are all format characters, Cf), a private-use or
 * unassigned character (Co, Cn, and lone surrogates, Cs), a blank (the Z categories) and `<`/`>`.
 * A plain space is judged by its position, not here.
 */
const REFUSED = /[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Cs}\p{Z}<>]/u;

/** Which code points of `text` Claude Code refuses. A space is fine only alone between words. */
function refusedFlags(text: string): { readonly points: string[]; readonly flags: boolean[] } {
  const points = Array.from(text);
  const lastIndex = points.length - 1;
  const flags = points.map((point, index) =>
    point === ' '
      ? index === 0 || index === lastIndex || points[index - 1] === ' ' || points[index + 1] === ' '
      : REFUSED.test(point),
  );
  return { points, flags };
}

const hex = (point: string): string =>
  `U+${(point.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`;

/** The refused characters of `text` as code points (never the raw text: it may be invisible). */
export function refusedCharacters(text: string): string[] {
  const { points, flags } = refusedFlags(text);
  return points.filter((_point, index) => flags[index]).map(hex);
}

/** Each refused character becomes one hyphen. */
function hyphenate(text: string): string {
  const { points, flags } = refusedFlags(text);
  return points.map((point, index) => (flags[index] ? '-' : point)).join('');
}

const cannotHold = (field: string, found: readonly string[]): string =>
  `${field} has a character a command name can't hold (${found.join(', ')})`;

interface Chosen {
  readonly name: string;
  readonly issues: readonly PluginIssue[];
}

const NAMESPACE = 'anthropic-skills';

/** skills.md, "Names reserved for synced skills": `anthropic-skills` and `anthropic-skills:<name>`. */
export const reservedNamespace = (text: string): string | undefined =>
  text === NAMESPACE || text.startsWith(`${NAMESPACE}:`) ? NAMESPACE : undefined;

/** skills.md, "Choose where skills load": a folder named `synced`, "in any capitalization". */
const reservedFolder = (text: string): string | undefined =>
  text.toLowerCase() === 'synced' ? 'synced' : undefined;

interface Field {
  /** The issue's `path`, and the first word of its message. */
  readonly path: 'folder' | 'name';
  readonly label: string;
  readonly text: string | undefined;
  readonly fix: string;
  /** The reserved word of `text`, when it holds one. */
  readonly reserved: (text: string) => string | undefined;
}

/** The errors of one field: refused characters, and a reserved name (each refuses the skill). */
function fieldErrors(field: Field): PluginIssue[] {
  const { path, label, text, fix } = field;
  if (text === undefined) return [];
  const issues: PluginIssue[] = [];
  const found = refusedCharacters(text);
  if (found.length > 0) {
    issues.push(error(path, `${cannotHold(label, found)}; the skill is refused, ${fix}`));
  }
  const word = field.reserved(text);
  if (word !== undefined) {
    issues.push(
      error(
        path,
        `${label} uses "${word}", a name reserved for skills synced from claude.ai; the skill does not load, ${fix}`,
      ),
    );
  }
  return issues;
}

/**
 * Outside a plugin the skill is refused when its folder name or its frontmatter `name` holds a
 * refused character or is reserved. The folder `synced` is reserved only where Claude Code
 * authors no `synced` folder of its own: the user and project locations, not a synced skill.
 */
const strict =
  (reservesSyncedFolder: boolean) =>
  (dirName: string, declared: string | undefined): Chosen => {
    const issues = [
      ...fieldErrors({
        path: 'folder',
        label: 'folder name',
        text: dirName,
        fix: 'rename the folder',
        reserved: (text) =>
          reservedNamespace(text) ?? (reservesSyncedFolder ? reservedFolder(text) : undefined),
      }),
      ...fieldErrors({
        path: 'name',
        label: 'name',
        text: declared,
        fix: 'edit the name: line',
        reserved: reservedNamespace,
      }),
    ];
    return { name: declared ?? dirName, issues };
  };

/**
 * In a plugin the skill always loads. A folder's refused characters become hyphens in the command
 * name; a refused frontmatter `name` is not used (spec/judgments.md: the folder names the skill).
 */
function lenient(dirName: string, declared: string | undefined): Chosen {
  const bad = declared === undefined ? [] : refusedCharacters(declared);
  if (declared !== undefined && bad.length === 0) return { name: declared, issues: [] };
  const issues: PluginIssue[] = [];
  if (bad.length > 0) {
    issues.push(
      warning('name', `${cannotHold('name', bad)}; it is not used, the folder names the skill`),
    );
  }
  const name = hyphenate(dirName);
  if (name !== dirName) {
    issues.push(
      warning(
        'folder',
        `${cannotHold('folder name', refusedCharacters(dirName))}; each becomes a hyphen in the command name (${name})`,
      ),
    );
  }
  return { name, issues };
}

/**
 * The command name of a skill named by itself (the plugin root, or a manifest path to its folder),
 * oracle 2.1.319 (spec/judgments.md): the plugin's own `<plugin>:` prefix is dropped, then each
 * UTF-16 unit outside `[A-Za-z0-9_-]` is a hyphen, so `Plan Review` is `Plan-Review`, `other:x` is
 * `other-x` and an emoji is two. `claude plugin details` prints the name as written.
 */
export function selfNamedCommand(name: string, plugin: string): string {
  const own = name.startsWith(`${plugin}:`) ? name.slice(plugin.length + 1) : name;
  // No `u` flag on purpose: Claude Code replaces UTF-16 units, not code points.
  return own.replaceAll(/[^\w-]/g, '-');
}

interface NameRule {
  /** What the command starts with. */
  readonly prefix: (origin: SkillOrigin) => string;
  readonly choose: (dirName: string, declared: string | undefined) => Chosen;
}

export const pluginPrefix = (origin: SkillOrigin): string =>
  'plugin' in origin ? `${origin.plugin}:` : '';

const RULES: { readonly [K in SkillOriginKind]: NameRule } = {
  plugin: { prefix: pluginPrefix, choose: lenient },
  managed: { prefix: () => '', choose: strict(true) },
  user: { prefix: () => '', choose: strict(true) },
  project: { prefix: () => '', choose: strict(true) },
  synced: { prefix: () => `${NAMESPACE}:`, choose: strict(false) },
  // Judgment (spec/judgments.md): a host's own skill takes the rules of a skill outside a plugin,
  // `anthropic-skills` included ("reserved in every session"); no folder of its is scanned.
  bundled: { prefix: () => '', choose: strict(false) },
};

/**
 * Resolve the name and the command of a skill from where it sits and its frontmatter `name`
 * (`declared`, as read; undefined when absent). A `name` that already starts with the prefix is
 * not prefixed again (v2.1.246 and later). Never throws: a refusal is an error issue, and `name`
 * and `command` are then the text as written, for the host to report.
 */
export function resolveSkillName(layout: SkillLayout, declared: string | undefined): SkillName {
  const rule = RULES[layout.origin.kind];
  const { name, issues } = rule.choose(layout.dirName, layout.fixedName ? undefined : declared);
  const prefix = rule.prefix(layout.origin);
  return { name, command: name.startsWith(prefix) ? name : `${prefix}${name}`, issues };
}
