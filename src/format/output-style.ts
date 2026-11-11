import { parseFrontmatter } from './frontmatter.ts';
import { readFlag, readText, type FieldRead } from './frontmatter-values.ts';
import { warning, type PluginIssue } from './issues.ts';

/**
 * A custom output style (output-styles.md, "Create a custom output style"): a Markdown file whose
 * frontmatter is metadata and whose body is the instructions Claude Code sends with every request.
 */
export interface OutputStyle {
  /** `name`, else the file name without `.md`. */
  readonly name: string;
  /**
   * What `/output-style` and the `outputStyle` setting call it: `<plugin>:<name>` for a plugin style
   * (plugins/components.md, "Output styles"), `name` for a user, project or managed style.
   */
  readonly id: string;
  readonly description?: string;
  /** `keep-coding-instructions`, default `false`. */
  readonly keepCodingInstructions: boolean;
  /** `force-for-plugin`, default `false`, and always `false` for a style that is not a plugin's. */
  readonly forceForPlugin: boolean;
  /** The Markdown body: the instructions for Claude. */
  readonly instructions: string;
  /** The path as the host gave it. */
  readonly path: string;
}

/** Where the file was found. Only a plugin style is prefixed and may be forced. */
export interface OutputStyleContext {
  /** The plugin the file ships in; absent for a user, project or managed style. */
  readonly plugin?: string;
}

export interface OutputStyleRead {
  readonly style: OutputStyle;
  readonly issues: readonly PluginIssue[];
}

/** `output-styles/terse.md` is `terse`; both `/` and `\` separate a path. */
function fileName(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  return base.replace(/\.md$/i, '');
}

const FIELD_KEYS = {
  name: 'name',
  description: 'description',
  keep: 'keep-coding-instructions',
  force: 'force-for-plugin',
} as const;

/**
 * Read one output style file. Never throws and never refuses a file (output-styles.md: "If the
 * YAML doesn't parse, the style still loads under its file name with no fields set"; "A misspelled
 * field is ignored without an error"). What the docs leave open is in spec/judgments.md: a YAML
 * error and a value of the wrong shape are warnings, never errors.
 */
export function readOutputStyle(
  path: string,
  text: string,
  context: OutputStyleContext = {},
): OutputStyleRead {
  const parsed = parseFrontmatter(text);
  const issues: PluginIssue[] = [];
  if (parsed.problem !== undefined) {
    const where = parsed.line === undefined ? '' : ` (line ${parsed.line})`;
    issues.push(
      warning(
        path,
        `frontmatter ${parsed.problem}${where}; the style loads under its file name with no fields set`,
      ),
    );
  }
  const take = <T>(read: FieldRead<T>): T | undefined => {
    if (read.problem) issues.push(warning(path, `${read.problem.key} ${read.problem.reason}`));
    return read.value;
  };
  const { fields } = parsed;
  const name = take(readText(FIELD_KEYS.name, fields[FIELD_KEYS.name])) ?? fileName(path);
  const description = take(readText(FIELD_KEYS.description, fields[FIELD_KEYS.description]));
  const keep = take(readFlag(FIELD_KEYS.keep, fields[FIELD_KEYS.keep])) ?? false;
  const force = take(readFlag(FIELD_KEYS.force, fields[FIELD_KEYS.force])) ?? false;
  const { plugin } = context;
  return {
    style: {
      name,
      id: plugin === undefined ? name : `${plugin}:${name}`,
      ...(description === undefined ? {} : { description }),
      keepCodingInstructions: keep,
      forceForPlugin: plugin !== undefined && force,
      instructions: parsed.body.trim(),
      path,
    },
    issues,
  };
}
