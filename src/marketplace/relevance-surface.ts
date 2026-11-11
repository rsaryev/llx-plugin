import { effectiveTopic } from '../format/marketplace/relevance.ts';
import type { Relevance } from '../format/marketplace/types.ts';
import type { SignalName } from './relevance-match.ts';

/**
 * Where a matching plugin is suggested and how often (plugins/relevance.md, "Understand how plugin
 * relevance works", "Preview what the user sees"): the spinner tip, the session-start notification
 * and the `/plugin` Discover tab. Pure over what the host recorded; the texts are the docs'. The
 * counting of "sessions" and the annotations the docs do not quote are in spec/judgments.md.
 */

export interface SuggestedPlugin {
  readonly name: string;
  readonly marketplace: string;
  readonly relevance?: Relevance;
}

const installCommand = (plugin: SuggestedPlugin): string =>
  `/plugin install ${plugin.name}@${plugin.marketplace}`;

/** "Working with Terraform? Install the terraform-helpers plugin:" and the install command on the next line. */
export const spinnerTipText = (plugin: SuggestedPlugin): string =>
  `Working with ${effectiveTopic({ name: plugin.name, ...(plugin.relevance === undefined ? {} : { relevance: plugin.relevance }) })}? Install the ${plugin.name} plugin:\n${installCommand(plugin)}`;

/** The one-line notification of a `cwd` match at session start. */
export const sessionStartNoticeText = (plugin: SuggestedPlugin): string =>
  `plugin suggestion: ${plugin.name}@${plugin.marketplace} · /plugin`;

/** What the host recorded about one plugin's suggestions. */
export interface SuggestionHistory {
  /** Sessions started since the spinner tip or the notification last showed it; `undefined` when never shown. */
  readonly sessionsSinceShown?: number;
  /** Times the spinner tip and the notification together have shown it. */
  readonly timesShown: number;
  /** The Discover tab already pinned it once (`~/.claude.json`). */
  readonly discoverPinned: boolean;
}

export interface SuggestionContext {
  readonly installed: boolean;
  /** The signals that match now (`matchingSignals`). */
  readonly matched: readonly SignalName[];
  readonly history: SuggestionHistory;
  /** `spinnerTipsEnabled`; unset is on. */
  readonly spinnerTipsEnabled?: boolean;
  /** A `spinnerTipsOverride` with `excludeDefault` replaces the built-in tips. */
  readonly tipsOverrideExcludesDefault?: boolean;
}

/** "At most once every three sessions across the spinner tip and the session-start notification combined." */
const SESSIONS_BETWEEN_SUGGESTIONS = 3;
/** "Stops appearing once the spinner tip and the notification have shown the plugin a combined total of two times." */
const NOTICE_TOTAL_LIMIT = 2;

const tipsOn = (context: SuggestionContext): boolean =>
  context.spinnerTipsEnabled !== false && context.tipsOverrideExcludesDefault !== true;

const spaced = (history: SuggestionHistory): boolean =>
  history.sessionsSinceShown === undefined ||
  history.sessionsSinceShown >= SESSIONS_BETWEEN_SUGGESTIONS;

const eligible = (context: SuggestionContext): boolean =>
  !context.installed && context.matched.length > 0;

/** Whether the spinner tip shows the plugin now. */
export const showSpinnerTip = (context: SuggestionContext): boolean =>
  eligible(context) && tipsOn(context) && spaced(context.history);

/** Whether the session-start notification shows the plugin: a `cwd` match, the spacing, and at most two showings. */
export const showSessionStartNotice = (context: SuggestionContext): boolean =>
  eligible(context) &&
  context.matched.includes('cwd') &&
  tipsOn(context) &&
  spaced(context.history) &&
  context.history.timesShown < NOTICE_TOTAL_LIMIT;

/** The Discover tab pins the plugin the first time the tab opens while a signal matches; neither tip setting affects it. */
export const pinInDiscover = (context: SuggestionContext): boolean =>
  eligible(context) && !context.history.discoverPinned;

const ANNOTATION: { readonly [S in SignalName]: (command?: string) => string } = {
  cwd: () => 'suggested for this directory',
  cli: (command) => `suggested for ${command ?? 'these'} commands`,
  hosts: () => 'suggested for the hosts you reach',
  filesRead: () => 'suggested for the files you read',
  manifestDeps: () => 'suggested for your project dependencies',
};

/** The annotation that names the first matching signal; `command` is the matching command name of a `cli` signal. */
export function discoverAnnotation(
  matched: readonly SignalName[],
  command?: string,
): string | undefined {
  const first = matched[0];
  return first === undefined ? undefined : ANNOTATION[first](command);
}
