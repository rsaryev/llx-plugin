import { OFFICIAL_NAMES } from '../format/marketplace/marketplace-name-lists.ts';

/**
 * The `<claude-code-hint />` tag a CLI writes to stderr to recommend its plugin (plugins/cli-hints.md,
 * "Emit the hint", "Hint format", "Check when the prompt appears", "Preview what the user sees"): pure,
 * over output text and facts the host holds. The kit strips the lines and decides whether a prompt
 * shows; the host draws the dialog and installs at user scope.
 */

/** A hint that parsed: `value` is `name@marketplace`. */
export interface PluginHint {
  readonly v: string;
  readonly type: string;
  readonly value: string;
}

const TAG = /^\s*<claude-code-hint\s+([^<>]*?)\s*\/>\s*$/;
const ATTRIBUTE = /([A-Za-z][A-Za-z0-9_-]*)=(?:"([^"]*)"|([^\s"<>=]+))/g;

/** The three required attributes, double-quoted or unquoted (an unquoted value holds no whitespace). */
function parseTag(body: string): PluginHint | undefined {
  const found = new Map<string, string>();
  for (const match of body.matchAll(ATTRIBUTE)) {
    found.set(match[1] ?? '', match[2] ?? match[3] ?? '');
  }
  /* An unquoted value cannot hold whitespace, so a stray word is no attribute list (spec/judgments.md). */
  if (body.replace(ATTRIBUTE, '').trim() !== '') return undefined;
  const v = found.get('v');
  const type = found.get('type');
  const value = found.get('value');
  return v === undefined || type === undefined || value === undefined
    ? undefined
    : { v, type, value };
}

export interface StrippedOutput {
  /** The output the model sees. */
  readonly output: string;
  /** Every hint line removed, in order; a line whose attributes are incomplete is removed but not listed. */
  readonly hints: readonly PluginHint[];
}

/**
 * "The tag must occupy its own line; Claude Code ignores a tag embedded mid-line." A tag on its own line
 * is removed from the output "even when `v` or `type` is unrecognized".
 */
export function stripHints(output: string): StrippedOutput {
  const kept: string[] = [];
  const hints: PluginHint[] = [];
  for (const line of output.split('\n')) {
    const tag = TAG.exec(line.replace(/\r$/, ''));
    if (tag === null) {
      kept.push(line);
      continue;
    }
    const hint = parseTag(tag[1] ?? '');
    if (hint !== undefined) hints.push(hint);
  }
  return { output: kept.join('\n'), hints };
}

const SUPPORTED_VERSIONS: ReadonlySet<string> = new Set(['1']);
const SUPPORTED_TYPES: ReadonlySet<string> = new Set(['plugin']);

/** `v` `1` and `type` `plugin` are "the only supported value"; `value` is `name@marketplace`. */
export function supportedHint(
  hint: PluginHint,
): { readonly plugin: string; readonly marketplace: string } | undefined {
  if (!SUPPORTED_VERSIONS.has(hint.v) || !SUPPORTED_TYPES.has(hint.type)) return undefined;
  const at = hint.value.indexOf('@');
  if (at <= 0 || at === hint.value.length - 1 || hint.value.indexOf('@', at + 1) >= 0)
    return undefined;
  return { plugin: hint.value.slice(0, at), marketplace: hint.value.slice(at + 1) };
}

/** "Emit the tag only when `CLAUDECODE` or `CLAUDE_CODE_CHILD_SESSION` is set": what a CLI's gate reads. */
export const shouldEmitHint = (env: {
  readonly get: (name: string) => string | undefined;
}): boolean =>
  (env.get('CLAUDECODE') ?? '') !== '' || (env.get('CLAUDE_CODE_CHILD_SESSION') ?? '') !== '';

/** The one-line tag for a plugin in an official marketplace. */
export const hintLine = (value: string): string =>
  `<claude-code-hint v="1" type="plugin" value="${value}" />`;

/** "One prompt ever per plugin ... and none once 100 plugins have been prompted for on that machine." */
export const HINT_PROMPT_LIMIT = 100;

/** What the host knows when a hint arrives. */
export interface PromptFacts {
  /** An interactive terminal session; `claude -p`, a subagent run and hook command output are not. */
  readonly interactiveTerminal: boolean;
  /** The workspace is local and the session is attended (not `--cloud`, Remote Control or a teammate). */
  readonly localAttended: boolean;
  /** The plugin is in the local copy of an official marketplace, not installed, and no policy blocks it. */
  readonly installable: boolean;
  /** Claude Code's analytics are on. */
  readonly analyticsOn: boolean;
  /** A prompt already showed in this session. */
  readonly promptedThisSession: boolean;
  /** The plugins already prompted for on this machine. */
  readonly promptedPlugins: readonly string[];
  /** The user chose "No, and don't show plugin installation hints again". */
  readonly hintsTurnedOff: boolean;
}

export type PromptVerdict =
  | { readonly show: true; readonly plugin: string; readonly marketplace: string }
  | { readonly show: false; readonly reason: PromptRefusal };

export type PromptRefusal =
  | 'unsupported'
  | 'not-official'
  | 'not-interactive'
  | 'not-installable'
  | 'analytics-off'
  | 'already-prompted-this-session'
  | 'already-prompted-for-plugin'
  | 'prompt-limit'
  | 'hints-turned-off'
  | 'not-local-attended';

const OFFICIAL = new Set<string>(OFFICIAL_NAMES);

type Check = (
  context: { readonly plugin: string; readonly marketplace: string },
  facts: PromptFacts,
) => PromptRefusal | undefined;

/** The checks, in the docs' order; every one must pass. */
const CHECKS: readonly Check[] = [
  (context) => (OFFICIAL.has(context.marketplace) ? undefined : 'not-official'),
  (_, facts) => (facts.interactiveTerminal ? undefined : 'not-interactive'),
  (_, facts) => (facts.installable ? undefined : 'not-installable'),
  (_, facts) => (facts.analyticsOn ? undefined : 'analytics-off'),
  (_, facts) => (facts.promptedThisSession ? 'already-prompted-this-session' : undefined),
  (context, facts) =>
    facts.promptedPlugins.includes(`${context.plugin}@${context.marketplace}`)
      ? 'already-prompted-for-plugin'
      : undefined,
  (_, facts) => (facts.promptedPlugins.length >= HINT_PROMPT_LIMIT ? 'prompt-limit' : undefined),
  (_, facts) => (facts.hintsTurnedOff ? 'hints-turned-off' : undefined),
  (_, facts) => (facts.localAttended ? undefined : 'not-local-attended'),
];

/** Whether the **Plugin recommendation** dialog shows for a hint. */
export function promptVerdict(hint: PluginHint, facts: PromptFacts): PromptVerdict {
  const parsed = supportedHint(hint);
  if (parsed === undefined) return { show: false, reason: 'unsupported' };
  for (const check of CHECKS) {
    const reason = check(parsed, facts);
    if (reason !== undefined) return { show: false, reason };
  }
  return { show: true, ...parsed };
}

/** The three answers of the dialog. */
export type HintAnswer = 'install' | 'no' | 'never' | 'timeout';

export interface HintEffect {
  /** Install the plugin at user scope. */
  readonly install: boolean;
  /** Turn off future hint prompts for the user. */
  readonly turnOff: boolean;
}

/** "No answer for 30 seconds: counts as No." */
export const HINT_ANSWER_TIMEOUT_MS = 30_000;

const EFFECTS: { readonly [A in HintAnswer]: HintEffect } = {
  install: { install: true, turnOff: false },
  no: { install: false, turnOff: false },
  never: { install: false, turnOff: true },
  timeout: { install: false, turnOff: false },
};

export const answerEffect = (answer: HintAnswer): HintEffect => EFFECTS[answer];

/** The dialog's text: the command's first word, the plugin and the marketplace. */
export function dialogLines(
  command: string,
  plugin: string,
  marketplace: string,
  description?: string,
): readonly string[] {
  const first = command.trim().split(/\s+/)[0] ?? '';
  return [
    'Plugin recommendation',
    `The ${first} command suggests installing a plugin.`,
    `Plugin: ${plugin}`,
    `Marketplace: ${marketplace}`,
    ...(description === undefined ? [] : [`Description: ${description}`]),
    'Would you like to install it?',
    '1. Yes, install',
    '2. No',
    "3. No, and don't show plugin installation hints again",
  ];
}
