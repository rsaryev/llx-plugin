/** Skill and command expansion, invocation policy, listing and execution. */
export {
  INVOKERS,
  checkInvocation,
  invocationPolicy,
  type DenialReason,
  type InvocationPolicy,
  type InvocationVerdict,
  type Invocable,
  type Invoker,
} from './invocation.ts';
export {
  OVERRIDE_EXPOSURE,
  exposureOf,
  overrideMenuLabel,
  type Exposure,
  type ModelListing,
  type OverrideState,
  type SkillOverrides,
} from './visibility.ts';
export { loadCommandEntries, type CommandEntriesLoaded } from './command-entries.ts';
export { skillNamesOf } from './skill-rule.ts';
export {
  EMPTY_LEDGER,
  invokeSkill,
  reattachAfterCompaction,
  startTurn,
  type SkillDelivery,
  type Invocation,
  type LoadedSkill,
  type ReattachOptions,
  type SkillLedger,
  type TokenCounter,
} from './lifecycle.ts';
export { stackSkills, type Stack, type StackOptions } from './stack.ts';
export { skillLookup, type NamedInvocable, type SkillLookup } from './lookup.ts';
export {
  isLeading,
  readSkillMentions,
  type LeadingMention,
  type MentionOptions,
  type SkillMention,
} from './mention.ts';
export {
  isDormant,
  listedAs,
  listingLine,
  menuEntries,
  modelListing,
  type ListingBudget,
  type ListingEntry,
  type ListingOptions,
  type MenuOptions,
  type ModelListingResult,
} from './listing.ts';
export {
  ruleActivatesFor,
  ruleBase,
  skillActivatesFor,
  type PathGateOptions,
} from './path-gate.ts';
export {
  readExecutionEnvironment,
  resolveExecution,
  resolveShell,
  resolveTurnOverrides,
  type EffortChoice,
  type Execution,
  type ExecutionContext,
  type ExecutionEnvironment,
  type ModelAvailability,
  type ModelKept,
  type ShellAvailability,
  type ShellResolution,
  type Trigger,
  type TurnOverrides,
  type TurnSession,
  type WaitReason,
} from './execution.ts';
export {
  launchFork,
  type ForkAgents,
  type ForkLaunch,
  type ForkResult,
  type ForkStartContext,
} from './fork.ts';
export { DISTRIBUTION_PATHS, frontmatterIssues, type DistributionPath } from './portable.ts';
export { parseArguments } from './arguments.ts';
export type { ShellArguments } from './shell-arguments.ts';
export {
  substitute,
  substituteArgumentPieces,
  substituteArguments,
  type ArgumentInput,
  type Substitution,
  type SubstitutionInput,
} from './substitute.ts';
export {
  buildVariables,
  substituteAllowedTools,
  substituteVariables,
  type AllowedToolsSubstituted,
  type SkillSession,
  type SkillVariablePorts,
  type SkillVariables,
  type VariableSource,
  type VariablesSubstituted,
} from './variables.ts';
export {
  expandSkill,
  type ExpandPolicy,
  type ExpandPorts,
  type ExpandRequest,
  type ExpandSession,
  type SkillPluginSource,
  type Expansion,
  type SessionLimits,
  type ShellCall,
  type ShellPermission,
} from './expand.ts';
export {
  admitSkillHooks,
  countSkillHooks,
  hookSourceOf,
  type HooksAdmission,
  type HookUsage,
} from './hook-limits.ts';
export { scopeFilePath, type ScopeFileKind } from './scan/file-location.ts';
export {
  SCAN_SCOPES,
  type ScanContext,
  type ScanRequest,
  type ScanScope,
} from './scan/locations.ts';
export {
  scanFolders,
  type ScanOutcome,
  type ScannedEntry,
  type SkillsDirectoryPlugin,
} from './scan/scan.ts';
export { scanNested, type NestedScan } from './scan/nested.ts';
export { scanSkillContainer, type ContainerRequest } from './scan/container.ts';
export {
  resolveFolderSkills,
  type NameHolder,
  type Resolution,
  type ResolveFolderOptions,
  type ResolvedFolderSkill,
  type ShadowedEntry,
  type YieldedName,
} from './scan/resolve.ts';

export {
  attachesFileReferences,
  readFileReferences,
  type FileReference,
  type ReferenceBase,
} from './file-references.ts';
export { findInjections, type Injection, type InjectionKind } from './shell-scan.ts';
export {
  runInjections,
  type InjectionContext,
  type InjectionPorts,
  type InjectionResults,
  type PlannedCommand,
} from './shell-run.ts';
