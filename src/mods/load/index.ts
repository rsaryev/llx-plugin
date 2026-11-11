/** Loading mods: policy, order, the scan, the loader, `claude plugin validate`, `claude plugin test` and the host that wires the mods runtime together (plugins/mods/reference.md, "Settings and environment variables", "Commands"). */
export {
  createModsHost,
  type CommandOrigin,
  type FireOptions,
  type RunCommandOptions,
  type ModLoadReport,
  type ModsHost,
  type ModsHostOptions,
} from './host.ts';
export type { ModNotice } from './mod-set.ts';
export { registeredView, type ModsRegistered } from './registered.ts';
export { type LoadedMod, type ModPlugin, type ReloadOutcome } from './loader.ts';
export {
  decideModLoad,
  hooksModulesOff,
  type ModCandidate,
  type ModLoadDecision,
} from './policy.ts';
export type { Credential, ModsPolicyInput, ModsSettingsFile } from './policy-input.ts';
export { orderMods, type ModOrder, type OrderedMod, type SkippedMod } from './order.ts';
export { parsePluginDirs, sideloadRefusal, watchesPluginDirs } from './plugin-dirs.ts';
export {
  scanHooksModule,
  MOD_SCAN_ISSUE_CODES,
  type ModScan,
  type ModScanIssue,
  type ModScanIssueCode,
  type ModUses,
  type ScannedCall,
  type ScannedHook,
  type SurfaceModuleSpan,
} from './scan/index.ts';

export { modOptions, type ModOptions } from './options.ts';
export { REGISTER_RULES } from './register-call.ts';
export { activeModsLine } from './commands/active-line.ts';

export {
  validateMod,
  type FileReport,
  type ValidateInput,
  type ValidateReport,
} from './commands/validate.ts';
export {
  ESM_FORMAT,
  scanSourceOf,
  type CompileResult,
  type RunOutput,
  type ScanOutput,
} from './compile-output.ts';
export { engineStackIssue, type StackPhase } from './engine-faults.ts';
export {
  MODS_APPS,
  MODS_MINIMUM_VERSION,
  modsVersionProblem,
  whereModsRun,
  type ModsApp,
  type ModsWhere,
  type WhereModsRun,
} from './where-mods-run.ts';
/** Host release order for the docs' version rules: one implementation, format's. */
export { versionAtLeast } from '../../format/versions.ts';
export {
  modLineChannel,
  type ModLineChannel,
  type ModLineKind,
  type ModLineSession,
} from './line-channel.ts';
export { changeNotice } from './change-notice.ts';
export {
  createHotReloadGate,
  writtenModRefusal,
  type HotReloadAnswer,
  type HotReloadGate,
  type HotReloadState,
  type WrittenModGate,
  type WrittenModRefusal,
  type WrittenModSession,
} from './written-mods.ts';
export {
  createWorkerHealth,
  offLine,
  unloadedLine,
  WORKER_STOP_LIMIT,
  type CrashPlan,
  type WorkerHealth,
} from './health.ts';

export { runModToolCall, type ModToolFlow, type ModToolFlowResult } from './tool-flow.ts';
export { runModPromptSubmit } from './prompt-flow.ts';
export type { ManagedModData } from './guard-protection.ts';
export { modApprovalSkipsClassifier, type ModApprovalFacts } from './auto-mode-approval.ts';
