import type { PluginIssue } from '../format/issues.ts';
import type { PermissionMode } from '../protocol/official.ts';
import {
  parseRule,
  type DecideContext,
  type MatchContext,
  type PathContext,
  type PermissionRule,
  type RuleSource,
} from '../rules/index.ts';
import type {
  PermissionsPolicy,
  PolicyScope,
  SettingsRule,
  StartInput,
} from '../settings/index.ts';

/**
 * The rules, the starting mode and the session facts of the permission settings as the input of
 * `decide` (docs/API.md, "Permissions in a session"): where the settings (layer 3) and the rules
 * (layer 3) meet. Pure over the settings policy and what the host knows of the launch.
 */

/** Where a settings file's rules are written, for the parser and the path anchors (permissions.md, "Settings precedence"). */
const RULE_SOURCES: { readonly [S in PolicyScope]: RuleSource } = {
  managed: { kind: 'managed' },
  parent: { kind: 'embedder-managed' },
  flag: { kind: 'flag-settings', file: '--settings' },
  local: { kind: 'local' },
  project: { kind: 'project' },
  user: { kind: 'user' },
  addDir: { kind: 'project' },
};

/** Rules the launch adds: `--allowedTools` and `--disallowedTools` (permissions.md, "Settings precedence"). */
export interface CommandLineRules {
  readonly allowed?: readonly string[];
  readonly disallowed?: readonly string[];
}

export interface PermissionSessionInput {
  readonly policy: PermissionsPolicy;
  readonly start: StartInput;
  /** The folders rules are read against; the settings' `additionalDirectories` are added to the session's own. */
  readonly paths: PathContext;
  readonly match?: Omit<MatchContext, 'paths'>;
  readonly commandLine?: CommandLineRules;
  /** A `--permission-prompt-tool` or an SDK `canUseTool` callback answers what would prompt. */
  readonly permissionCallback?: boolean;
}

export interface PermissionSession {
  readonly mode: PermissionMode;
  /** What `decide` takes besides the call: the mode, the rules and the facts the settings decide. */
  readonly context: DecideContext;
  readonly issues: readonly PluginIssue[];
}

export type StartedPermissions =
  | ({ readonly outcome: 'started' } & PermissionSession)
  | { readonly outcome: 'refused'; readonly reason: string };

function parsed(
  entries: readonly SettingsRule[],
  commandLine: CommandLineRules,
  managedOnly: boolean,
): { rules: PermissionRule[]; issues: PluginIssue[] } {
  const cli: SettingsRule[] = [
    // "ignores `--allowedTools`" under `allowManagedPermissionRulesOnly`; `--disallowedTools` still applies.
    ...(managedOnly ? [] : (commandLine.allowed ?? []).map(textRule('allow'))),
    ...(commandLine.disallowed ?? []).map(textRule('deny')),
  ];
  const results = [
    ...entries.map((entry) =>
      parseRule(entry.text, { behavior: entry.behavior, source: RULE_SOURCES[entry.scope] }),
    ),
    ...cli.map((entry) =>
      parseRule(entry.text, { behavior: entry.behavior, source: { kind: 'cli' } }),
    ),
  ];
  return {
    rules: results.flatMap((result) => (result.rule === undefined ? [] : [result.rule])),
    issues: results.flatMap((result) => result.issues),
  };
}

const textRule =
  (behavior: SettingsRule['behavior']) =>
  (text: string): SettingsRule => ({ behavior, text, scope: 'flag' });

/**
 * Starts the permission side of a session: the mode, then the context `decide` reads. A start the
 * settings refuse (`--dangerously-skip-permissions` with `disableBypassPermissionsMode`, a background
 * bypass request nobody accepted) comes back as `refused`.
 */
export function startPermissions(input: PermissionSessionInput): StartedPermissions {
  const { policy, paths } = input;
  const start = policy.startingMode(input.start);
  if ('reason' in start) return start;
  const { rules, issues } = parsed(policy.rules, input.commandLine ?? {}, policy.managedRulesOnly);
  const additional = [
    ...new Set([
      ...paths.additionalDirectories,
      ...policy.additionalDirectories.map((each) => each.path),
    ]),
  ];
  const context: DecideContext = {
    mode: start.mode,
    rules,
    match: { ...input.match, paths: { ...paths, additionalDirectories: additional } },
    autoAvailable: start.autoAvailable,
    bypassAvailable: start.bypassAvailable,
    interactive: input.start.surface === 'terminal',
    ...(input.permissionCallback === true ? { permissionCallback: true } : {}),
    // "`claude -p` and Agent SDK runs ... Calls needing approval are denied unless you approve them
    // with an allow rule, hook, `canUseTool` callback, or `--permission-prompt-tool`."
    cannotPrompt: input.start.surface === 'headless' && input.permissionCallback !== true,
    useAutoModeDuringPlan: policy.autoMode.useAutoModeDuringPlan,
    repositoryDirectories: policy.additionalDirectories
      .filter((each) => each.repositoryOnly)
      .map((each) => each.path),
    blockReadsOutsideWorkingDirectories: policy.blockReadsOutsideWorkingDirectories,
    blockWritesOutsideWorkingDirectories: policy.blockWritesOutsideWorkingDirectories,
  };
  return { outcome: 'started', mode: start.mode, context, issues: [...start.issues, ...issues] };
}
