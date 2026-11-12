import type { OutputStyle } from './output-style.ts';

/**
 * Which output style is active, and what that means for the system prompt (output-styles.md,
 * "Change your output style" and "How output styles work"). Pure: the host reads its settings and
 * passes the values in.
 */

interface BuiltinStyle {
  readonly id: string;
  readonly description: string;
}

/**
 * `default` and the four built-in styles, in the order output-styles.md lists them. The
 * descriptions are the docs' own words ("What changes" column; Default section).
 */
export const BUILTIN_OUTPUT_STYLES: readonly BuiltinStyle[] = [
  {
    id: 'default',
    description: "Claude Code's standard instructions for completing software engineering tasks",
  },
  {
    id: 'Proactive',
    description:
      'Claude starts work right away and makes reasonable assumptions rather than asking about routine decisions',
  },
  {
    id: 'Concise',
    description: 'Responses lead with the result and leave out preamble, narration, and recaps',
  },
  {
    id: 'Explanatory',
    description:
      'Claude adds short `Insight` blocks that explain the choices behind the code it writes',
  },
  {
    id: 'Learning',
    description:
      'Claude explains its choices and leaves small pieces of code for you to write yourself',
  },
];

/** The id Default has in the `/output-style` list. */
export const DEFAULT_OUTPUT_STYLE_ID = 'default';

/** The style in force: Default, a built-in one, or a custom one (`style` is set). */
export interface StyleSelection {
  readonly id: string;
  /**
   * Whether Claude Code's software engineering instructions stay in the prompt: Default and the
   * built-in styles keep them ("Each of the four other built-in styles keeps those
   * instructions"), a custom style only with `keep-coding-instructions`.
   */
  readonly keepCodingInstructions: boolean;
  readonly style?: OutputStyle;
}

const builtinSelection = ({ id }: BuiltinStyle): StyleSelection => ({
  id,
  keepCodingInstructions: true,
});

const DEFAULT_SELECTION: StyleSelection = {
  id: DEFAULT_OUTPUT_STYLE_ID,
  keepCodingInstructions: true,
};

const customSelection = (style: OutputStyle): StyleSelection => ({
  id: style.id,
  keepCodingInstructions: style.keepCodingInstructions,
  style,
});

export interface OutputStyleRequest {
  /** The `outputStyle` setting, as the merged settings hold it. */
  readonly setting?: string;
  /** The argument of `/output-style <style>` given in this session. */
  readonly command?: string;
  /**
   * The custom styles of the enabled plugins, the user, the project and managed settings, in
   * precedence order: when two share an id the first wins, so a project style closer to the working
   * directory goes first, and of several forced styles the first loaded wins.
   */
  readonly styles: readonly OutputStyle[];
}

function candidates(styles: readonly OutputStyle[]): readonly StyleSelection[] {
  return [...BUILTIN_OUTPUT_STYLES.map(builtinSelection), ...styles.map(customSelection)];
}

/**
 * The style the argument of `/output-style <style>` names, a built-in or a custom one, without
 * regard to case; `undefined` when it names none, which leaves the choice to the setting.
 */
export function findOutputStyle(
  styles: readonly OutputStyle[],
  argument: string,
): StyleSelection | undefined {
  const wanted = argument.trim().toLowerCase();
  return candidates(styles).find((entry) => entry.id.toLowerCase() === wanted);
}

/**
 * The active style. A `force-for-plugin` style wins over everything ("Overrides the user's
 * `outputStyle` setting"). Otherwise `/output-style` (which ignores case) wins over the setting,
 * which is case-sensitive: "A value that doesn't match a style name exactly, such as
 * `explanatory`, gives you the Default style."
 */
export function resolveOutputStyle({
  setting,
  command,
  styles,
}: OutputStyleRequest): StyleSelection {
  const forced = styles.find((style) => style.forceForPlugin);
  if (forced) return customSelection(forced);
  const byCommand = command === undefined ? undefined : findOutputStyle(styles, command);
  const bySetting = candidates(styles).find((entry) => entry.id === setting);
  return byCommand ?? bySetting ?? DEFAULT_SELECTION;
}

/** Which system prompt Claude Code builds. */
export type PromptKind = 'full' | 'short';

/**
 * Whether the prompt has Claude Code's section of software engineering instructions at all: "the
 * shorter system prompt doesn't include that section, so the field has no effect there".
 */
const PROMPT_HAS_CODING_SECTION: { readonly [K in PromptKind]: boolean } = {
  full: true,
  short: false,
};

/**
 * Whether the final prompt carries Claude Code's software engineering instructions. On the full
 * prompt a custom style drops them unless `keep-coding-instructions` is true; on the short prompt
 * there is nothing to keep or drop.
 */
export function includeCodingInstructions(
  selection: StyleSelection,
  promptKind: PromptKind,
): boolean {
  return PROMPT_HAS_CODING_SECTION[promptKind] && selection.keepCodingInstructions;
}

export interface OutputStyleChoice {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  /** The style in force, which `/output-style` with no argument marks. */
  readonly current: boolean;
}

/**
 * What `/output-style` lists with no argument and the `/config` picker shows: Default, the
 * built-in styles, then each custom style with its `name` and `description`. It lists the same pool
 * `resolveOutputStyle` selects from, so a custom style that reuses a built-in id or an earlier
 * style's id is left out (the first wins) and exactly one row is current.
 */
export function listOutputStyles(
  styles: readonly OutputStyle[],
  current: StyleSelection,
): readonly OutputStyleChoice[] {
  const builtin = BUILTIN_OUTPUT_STYLES.map(({ id, description }) => ({
    id,
    name: id,
    description,
    current: id === current.id,
  }));
  const builtinIds = new Set(BUILTIN_OUTPUT_STYLES.map(({ id }) => id));
  const custom = styles
    .filter(
      (style, index) =>
        !builtinIds.has(style.id) && styles.findIndex(({ id }) => id === style.id) === index,
    )
    .map((style) => ({
      id: style.id,
      name: style.name,
      ...(style.description === undefined ? {} : { description: style.description }),
      current: style.id === current.id,
    }));
  return [...builtin, ...custom];
}
