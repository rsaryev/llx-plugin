/** Re-exports of the install, add-failure, hint, relevance and name-conflict modules (plugins/*.md pages named in each). */
export {
  ACCEPTED_SOURCE_FORMS,
  addFailureMessage,
  gitUrlRefusal,
  missingMarketplace,
  type AddFailure,
  type MissingMarketplace,
} from './add-failures.ts';
export {
  clonePlan,
  shorthandAttempts,
  type CloneTransport,
  type ClonePlan,
  type ShorthandFacts,
  type SshProgramFacts,
} from './git-transport.ts';
export {
  matchesAtSessionStart,
  matchingSignals,
  type ManifestFact,
  type SessionFacts,
  type SignalName,
} from './relevance-match.ts';
export {
  discoverAnnotation,
  pinInDiscover,
  sessionStartNoticeText,
  showSessionStartNotice,
  showSpinnerTip,
  spinnerTipText,
  type SuggestedPlugin,
  type SuggestionContext,
  type SuggestionHistory,
} from './relevance-surface.ts';
export {
  HINT_ANSWER_TIMEOUT_MS,
  answerEffect,
  dialogLines,
  hintLine,
  promptVerdict,
  shouldEmitHint,
  stripHints,
  type HintAnswer,
  type HintEffect,
  type PluginHint,
  type PromptFacts,
  type PromptRefusal,
  type PromptVerdict,
  type StrippedOutput,
} from './plugin-hints.ts';
export {
  afterDisabling,
  sessionOnlyOffEntry,
  type HookCopy,
  type HookNote,
} from './name-conflicts.ts';
export {
  contextEntries,
  footprintGuide,
  processesOf,
  runsAs,
  type ComponentSummary,
  type ContextEntry,
  type FootprintGuide,
  type PluginSummary,
  type Processes,
} from './plugin-footprint.ts';
export { declaredSourceFix } from './declared-source.ts';
export {
  SKIPPED_TUTORIAL_STEP,
  deprecatedPluginAdvice,
  type DeprecatedPluginAdvice,
} from './deprecated-marketplace.ts';
export { nextStep, type MissingPluginFacts, type Step } from './missing-plugin-diagnosis.ts';
