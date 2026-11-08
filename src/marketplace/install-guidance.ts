/** Re-exports of the install, add-failure, hint, relevance and name-conflict modules (plugins/*.md pages named in each). */
export {
  ACCEPTED_SOURCE_FORMS,
  addFailureMessage,
  gitUrlRefusal,
  idPartRefusal,
  missingMarketplace,
  type AddFailure,
  type MissingMarketplace,
} from './add-failures.ts';
export {
  NO_PROMPT_ENVIRONMENT,
  clonePlan,
  shorthandAttempts,
  shorthandTransport,
  type CloneTransport,
  type ClonePlan,
  type ShorthandFacts,
  type SshProgramFacts,
} from './git-transport.ts';
export {
  MANIFEST_SIZE_LIMIT,
  commandHosts,
  commandName,
  cwdMatches,
  globMatches,
  matchesAtSessionStart,
  matchingSignals,
  type ManifestFact,
  type SessionFacts,
  type SignalName,
} from './relevance-match.ts';
export {
  NOTICE_TOTAL_LIMIT,
  SESSIONS_BETWEEN_SUGGESTIONS,
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
  HINT_PROMPT_LIMIT,
  answerEffect,
  dialogLines,
  hintLine,
  promptVerdict,
  shouldEmitHint,
  stripHints,
  supportedHint,
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
  hookConflictNotes,
  nameHolder,
  resolveNameConflict,
  sessionOnlyOffEntry,
  type HookCopy,
  type HookNote,
  type NameCandidate,
  type NameVerdict,
  type PluginOrigin,
} from './name-conflicts.ts';
export {
  contextEntries,
  footprintGuide,
  processesOf,
  runsAs,
  showsContextCost,
  type ComponentSummary,
  type ContextEntry,
  type FootprintGuide,
  type PluginSummary,
  type Processes,
} from './plugin-footprint.ts';
export {
  declaredSourceFix,
  declaredSourceMismatch,
  declaredSourceRefusal,
  type DeclaredSourceFacts,
} from './declared-source.ts';
export {
  DEPRECATED_MARKETPLACE,
  SKIPPED_TUTORIAL_STEP,
  deprecatedPluginAdvice,
  officialInstallCommand,
  type DeprecatedPluginAdvice,
} from './deprecated-marketplace.ts';
export { nextStep, type MissingPluginFacts, type Step } from './missing-plugin-diagnosis.ts';
