/** Permission rules (the syntax of `Tool(specifier)`, matching, the deny, ask, allow order) and the hook matcher grammar. */
export { requiresPromptDespitePrefixRule } from './bash/exec-wrappers.ts';
export { evaluateIf, type IfResult } from './bash/if-eval.ts';
export { splitCommand, type SplitCommand } from './bash/split.ts';
export { matchBashPattern } from './bash/wildcard.ts';
export { wildcardBannerRow } from './bash/wildcard-warning.ts';
export { matchCdRule, type CdTarget } from './path/cd.ts';
export { isNetworkPath, readsNetworkPath } from './path/network.ts';
export { prepareCall, resolveRuleDirectories } from './path/symlink.ts';
export type { PathResolver } from '../ports/path-resolver.ts';
export { matchDomainPattern, sandboxDomainEntry, sandboxDomainLists } from './target/domain.ts';
export type { SandboxDomainEntry, SandboxList } from './target/domain.ts';
export {
  mcpToolName,
  mcpToolRuleMatches,
  normalizeMcpServerName,
  pluginMcpServerName,
} from './target/mcp.ts';
export { stripWrappers } from './bash/wrappers.ts';
export { evaluateRules, matchRule } from './evaluate.ts';
export { matchesMatcher } from './hook-matcher.ts';
export { ruleIssues } from './issues.ts';
export type { SpecifierMatcher, SpecifierMatchers } from './matchers.ts';
export { formatRule, parseRule, type RuleOrigin, type RuleParse } from './parse.ts';
export { RULE_FORMATS, type RuleFormatId } from './specifier-formats.ts';
export type {
  Decision,
  DecisionReason,
  MatchContext,
  PathContext,
  PermissionRule,
  PreparedCall,
  RuleSource,
  RuleVerdict,
  Specifier,
  ToolCall,
} from './types.ts';
export {
  settleClassification,
  type ClassificationRequest,
  type PermissionClassifier,
} from './decide/classifier.ts';
export type {
  DecideContext,
  PreToolUseHookOutcome,
  ModOutcome,
  ProtectedPathOptions,
} from './decide/context.ts';
export {
  APPROVAL_MEMORY,
  TOOL_TYPES,
  approvalMemory,
  toolTypeOf,
  type ApprovalLifetime,
  type ApprovalMemory,
  type ApprovalOptions,
  type ToolType,
} from './decide/approval-memory.ts';
export { decide } from './decide/decide.ts';
export {
  CHANGED_INPUT_DENIAL,
  reviewHookRewrite,
  type HookRewriteCall,
  type HookRewriteSession,
  type HookRewriteVerdict,
} from './decide/hook-rewrite.ts';
export {
  catalogEntry,
  isKnownTool,
  KNOWN_TOOLS,
  TOOL_CATALOG,
  toolRequiresPermission,
  type CatalogToolEntry,
} from './tools/catalog.ts';
export { availableTools, type ToolSession } from './tools/availability.ts';
export {
  TOOL_INPUT_FIELDS,
  type FieldRole,
  type FieldSource,
  type FieldSpec,
  type FieldType,
  type InputToolName,
} from './tools/inputs/fields.ts';
export { parseToolInput, type InputParse } from './tools/inputs/parse-input.ts';
export {
  answerQuestions,
  type AnsweredQuestions,
  type AskedQuestions,
} from './tools/inputs/ask-user-question.ts';
export { effectiveExitPlanModeInput } from './tools/inputs/exit-plan-mode.ts';
export { effectiveSearchMode, type WebSearchMode } from './tools/inputs/web-search.ts';
export { expandToolInputPath, expandToolPath } from './tools/inputs/tool-path.ts';
export { applyEdit, type EditRequest, type EditResult } from './tools/semantics/edit.ts';
export {
  editEncodingIssue,
  NOT_UTF8_MESSAGE,
  writeEncodingIssue,
  type InPlaceEditTool,
} from './tools/semantics/encoding.ts';
export {
  backgroundTimeLimit,
  effectiveBashTimeout,
  type BackgroundRequest,
  type BackgroundSession,
} from './tools/semantics/bash-limits.ts';
export {
  bashOutputLimits,
  windowBashOutput,
  type BashOutputLimits,
  type BashOutputRequest,
  type BashOutputWindow,
} from './tools/semantics/bash-output.ts';
export { classifyBashExit, classifyPowerShellExit } from './tools/semantics/bash-exit.ts';
export {
  backgroundCwdNote,
  backgroundStopNotice,
  movedByTimeoutNotice,
  shouldMoveToBackground,
  type MoveSession,
} from './tools/semantics/bash-background.ts';
export {
  classifyReadSize,
  classifyReadTarget,
  partialViewNotice,
  READ_TOO_LARGE_MESSAGE,
  readTokenLimit,
  type ReadOutcome,
  type ReadRefusal,
  type ReadSizing,
  type ReadTarget,
} from './tools/semantics/read-limits.ts';
export {
  redirectNotice,
  webFetchTimings,
  type FetchTimings,
} from './tools/semantics/web-fetch-timings.ts';
export {
  webSearchAllowance,
  webSearchLimits,
  type WebSearchLimits,
  type WebSearchSession,
  type WebSearchUsage,
} from './tools/semantics/web-search-limit.ts';
export {
  readWindow,
  type NumberedLine,
  type ReadRequest,
  type ReadSlice,
} from './tools/semantics/read-window.ts';
export {
  checkWebFetchUrl,
  FETCH_WINDOW_CHARACTERS,
  LOCAL_HOST_MESSAGE,
  sliceFetched,
  type CheckedUrl,
  type FetchedPart,
} from './tools/semantics/web-fetch.ts';
export { validateWebSearchDomains } from './tools/semantics/web-search.ts';
export { GREP_OUTPUT_MODES, type GrepOutputMode } from './tools/inputs/grep.ts';
export {
  effectiveGrepMultiline,
  NO_ENTRIES_AT_OFFSET,
  effectiveGrepOutputMode,
  totalGrepCount,
  windowGrepContent,
  windowGrepCounts,
  type GrepCount,
  type GrepWindow,
  type GrepWindowRequest,
} from './tools/semantics/grep-defaults.ts';
export {
  capGlobMatches,
  globRespectsIgnore,
  GLOB_RESULT_CAP,
  validateGlobInput,
  type CappedGlob,
  type GlobMatch,
} from './tools/semantics/glob-cap.ts';
export {
  parseAgentResponse,
  type AgentResponse,
  type AgentResponseParse,
  type AgentTextBlock,
  type AgentUsage,
  type CompletedAgentResponse,
  type LaunchedAgentResponse,
} from './tools/responses/agent-response.ts';
export {
  bashEditDiffTrust,
  parseBashEditDiff,
  MAX_CHANGED_FILES,
  MAX_DIFFED_FILES,
  type BashEditDiff,
  type BashEditDiffParse,
  type BashEditDiffTrust,
  type BashEditFile,
} from './tools/responses/bash-edit-diff.ts';
export { interactiveShell, type InteractiveShell } from './tools/shell-selection.ts';
