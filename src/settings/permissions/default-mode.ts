import { warning, type PluginIssue } from '../../format/issues.ts';
import type { PermissionMode } from '../../protocol/official.ts';
import { normalizePermissionMode } from '../../protocol/permission-modes.ts';
import type { PolicyScope } from '../layers.ts';
import type { PolicyView } from '../view.ts';
import { startNotices } from './start-notices.ts';

/**
 * Which permission mode a session starts in (permission-modes.md, "Which mode a session starts in",
 * "Start in a different permission mode", "Skip all checks with bypassPermissions mode",
 * "Bypass permissions ignored in a background session"; settings-reference.md,
 * `permissions.defaultMode`, `disableAutoMode`, `permissions.disableBypassPermissionsMode`).
 * Pure over the settings and what the host knows of the launch.
 */

/** Where the session runs: the terminal, the VS Code extension, or `claude -p` and the Agent SDK. */
export const LAUNCH_SURFACES = ['terminal', 'vscode', 'headless'] as const;
export type LaunchSurface = (typeof LAUNCH_SURFACES)[number];

/** What the host knows of the launch and the session. */
export interface StartInput {
  readonly surface: LaunchSurface;
  /** `--permission-mode <value>` as typed (`manual` is an alias for `default`). */
  readonly permissionMode?: string;
  /** `--dangerously-skip-permissions`. */
  readonly dangerouslySkipPermissions?: boolean;
  /** `--allow-dangerously-skip-permissions`: makes `bypassPermissions` selectable later. */
  readonly allowDangerouslySkipPermissions?: boolean;
  /**
   * Auto mode can be used: the model supports it and Anthropic has not turned it off ("Auto mode is
   * unavailable when the session doesn't meet the availability requirements").
   */
  readonly autoAvailable: boolean;
  /** The HIPAA configuration is applied and the session is eligible for it. */
  readonly hipaa?: boolean;
  /** A background session (`claude --bg`). */
  readonly background?: boolean;
  /** Started with `--restricted`, which refuses `bypassPermissions`. */
  readonly restricted?: boolean;
  /** Running as root or under `sudo` on Linux or macOS, outside a recognized sandbox. */
  readonly privileged?: boolean;
}

/** Why the session starts in the mode it does. */
export type StartSource = 'flag' | 'settings' | 'built-in';

export type StartingMode =
  | {
      readonly outcome: 'started';
      readonly mode: PermissionMode;
      readonly source: StartSource;
      /** Bypass permissions was enabled at launch, so plan mode does not enforce its blocks at a terminal. */
      readonly bypassAvailable: boolean;
      /** Auto mode is in the session's mode cycle. */
      readonly autoAvailable: boolean;
      /** An interactive session entering `bypassPermissions` shows the warning dialog first. */
      readonly bypassWarning: boolean;
      /** Notices the session shows at its start, verbatim (`startNotices`). */
      readonly notices: readonly string[];
      /** What the session shows and the settings said, as warnings. */
      readonly issues: readonly PluginIssue[];
    }
  | { readonly outcome: 'refused'; readonly reason: string };

/** The settings files each surface reads `permissions.defaultMode` from (settings-reference.md). */
const READS: { readonly [S in LaunchSurface]: (scope: PolicyScope) => boolean } = {
  terminal: () => true,
  headless: () => true,
  // "For conversations the VS Code extension starts, Claude Code reads only user, managed, and `--settings` values."
  vscode: (scope) => scope === 'user' || scope === 'managed' || scope === 'flag',
};

/** The built-in starting mode of each surface, before the HIPAA and `disableAutoMode` rows. */
const BUILT_IN: { readonly [S in LaunchSurface]: PermissionMode } = {
  terminal: 'auto',
  vscode: 'auto',
  headless: 'default',
};

/** What a settings value does from each file: `auto` and `bypassPermissions` "don't take effect from project or local settings". */
const REPOSITORY_SCOPES: ReadonlySet<PolicyScope> = new Set(['project', 'local']);

const BYPASS: PermissionMode = 'bypassPermissions';
const AUTO: PermissionMode = 'auto';
const MANUAL: PermissionMode = 'default';

/** The notice a background session shows for an ignored bypass request (permission-modes.md, verbatim). */
export const BYPASS_IGNORED_NOTICE =
  'Bypass permissions was requested at launch and ignored · if that was you, ~/.claude/settings.json needs "skipDangerousModePermissionPrompt": true';

interface Chosen {
  readonly mode: PermissionMode | undefined;
  readonly source: StartSource;
  readonly issues: readonly PluginIssue[];
}

const settingsIssue = (scope: PolicyScope, mode: PermissionMode, outcome: string): PluginIssue =>
  warning(
    `${scope}:permissions.defaultMode`,
    `"${mode}" does not take effect from ${scope} settings; ${outcome}`,
  );

/**
 * The mode `permissions.defaultMode` selects: the highest file the surface reads that sets it. An
 * `auto` there from a project or local file is no value and "Claude Code then uses the built-in
 * default rather than a `defaultMode` from `~/.claude/settings.json`"; `bypassPermissions` from
 * those files "doesn't take effect either, and the session starts in Manual mode".
 */
function fromSettings(view: PolicyView, surface: LaunchSurface): Chosen {
  const holder = view
    .eachFromHighest('permissions')
    .find(
      (each) =>
        READS[surface](each.scope) &&
        typeof each.value.defaultMode === 'string' &&
        normalizePermissionMode(each.value.defaultMode) !== undefined,
    );
  const mode =
    holder === undefined ? undefined : normalizePermissionMode(holder.value.defaultMode ?? '');
  if (holder === undefined || mode === undefined)
    return { mode: undefined, source: 'built-in', issues: [] };
  if (!REPOSITORY_SCOPES.has(holder.scope)) return { mode, source: 'settings', issues: [] };
  if (mode === AUTO) {
    return {
      mode: undefined,
      source: 'built-in',
      issues: [settingsIssue(holder.scope, mode, 'the built-in default applies')],
    };
  }
  if (mode === BYPASS) {
    return {
      mode: MANUAL,
      source: 'settings',
      issues: [settingsIssue(holder.scope, mode, 'the session starts in Manual mode')],
    };
  }
  return { mode, source: 'settings', issues: [] };
}

/** `--dangerously-skip-permissions` is `--permission-mode bypassPermissions`; an unknown value is refused. */
function fromFlag(input: StartInput): Chosen | { readonly reason: string } | undefined {
  if (input.dangerouslySkipPermissions === true)
    return { mode: BYPASS, source: 'flag', issues: [] };
  if (input.permissionMode === undefined) return undefined;
  const mode = normalizePermissionMode(input.permissionMode);
  return mode === undefined
    ? { reason: `"${input.permissionMode}" is not a permission mode` }
    : { mode, source: 'flag', issues: [] };
}

/** The scopes that record the acceptance of the bypass warning in a way a background session honors. */
const ACCEPTANCE_SCOPES: ReadonlySet<PolicyScope> = new Set(['user', 'managed']);

/** How the acceptance of the bypass warning is recorded (permission-modes.md, "Skip all checks with bypassPermissions mode"). */
export type Acceptance = 'recorded' | 'elsewhere' | 'none';

function bypassAcceptance(view: PolicyView): Acceptance {
  const scopes = view
    .eachFromHighest('skipDangerousModePermissionPrompt')
    .filter((each) => each.value);
  if (scopes.some((each) => ACCEPTANCE_SCOPES.has(each.scope))) return 'recorded';
  return scopes.length > 0 ? 'elsewhere' : 'none';
}

/** What a background session does with a bypass request, per how the acceptance is recorded. */
const BACKGROUND_BYPASS: {
  readonly [A in Acceptance]: 'honor' | 'ignore' | 'refuse';
} = { recorded: 'honor', elsewhere: 'ignore', none: 'refuse' };

const refuse = (reason: string): StartingMode => ({ outcome: 'refused', reason });

/** The settings' two locks on a mode. */
interface Locks {
  readonly noAuto: boolean;
  readonly noBypass: boolean;
  /** The bypass warning dialog is skipped (`skipDangerousModePermissionPrompt`). */
  readonly skipWarning: boolean;
}

/** The mode after the settings' locks and the availability of auto mode. */
function restrict(mode: PermissionMode, locks: Locks, autoAvailable: boolean): PermissionMode {
  if (mode === AUTO && (locks.noAuto || !autoAvailable)) return MANUAL;
  return mode === BYPASS && locks.noBypass ? MANUAL : mode;
}

/** The settings keys the start reads, from the view. */
export interface StartSettings {
  readonly disableAutoMode: boolean;
  readonly disableBypassPermissionsMode: boolean;
  readonly skipDangerousModePermissionPrompt: boolean;
}

/** The built-in default: `default` under `disableAutoMode`, in `-p` and the SDK, and under the HIPAA configuration. */
function builtIn(input: StartInput, settings: StartSettings): PermissionMode {
  if (settings.disableAutoMode || input.hipaa === true) return MANUAL;
  return BUILT_IN[input.surface];
}

const BYPASS_LOCKED =
  'bypassPermissions is rejected while "permissions.disableBypassPermissionsMode" is "disable"';
const BYPASS_RESTRICTED = 'bypassPermissions is refused in a session started with --restricted';
/** permission-modes.md, verbatim. */
export const BYPASS_AS_ROOT =
  '--dangerously-skip-permissions cannot be used with root/sudo privileges for security reasons';
const BYPASS_NOT_ACCEPTED =
  'Bypass permissions needs the warning accepted first: accept it in an interactive session';

/**
 * What a background session does with the bypass request of a launch, by what was asked for: a
 * mode that is refused with no acceptance recorded, `--allow-dangerously-skip-permissions`, which
 * is only ignored.
 */
function backgroundGate(
  view: PolicyView,
  input: StartInput,
  wanted: PermissionMode,
): 'honor' | 'ignore' | 'refuse' {
  const requested = wanted === BYPASS || input.allowDangerouslySkipPermissions === true;
  if (input.background !== true || !requested) return 'honor';
  const gate = BACKGROUND_BYPASS[bypassAcceptance(view)];
  return gate === 'refuse' && wanted !== BYPASS ? 'ignore' : gate;
}

interface Launch {
  readonly chosen: Chosen;
  readonly wanted: PermissionMode;
  readonly locks: Locks;
  readonly input: StartInput;
}

/** The mode the launch ends in: a bypass request a background session ignores is Manual. */
const modeOf = (
  wanted: PermissionMode,
  ignored: boolean,
  { locks, input }: Launch,
): PermissionMode =>
  ignored && wanted === BYPASS ? MANUAL : restrict(wanted, locks, input.autoAvailable);

/** The mode cycle and the dialog of a session that started in `mode`. */
function cycleOf(mode: PermissionMode, ignored: boolean, { locks, input }: Launch) {
  const asked = input.allowDangerouslySkipPermissions === true;
  return {
    bypassAvailable: !locks.noBypass && !ignored && (mode === BYPASS || asked),
    autoAvailable: input.autoAvailable && !locks.noAuto,
    bypassWarning: mode === BYPASS && input.surface !== 'headless' && !locks.skipWarning,
  };
}

/** Applies the background gate and the locks to the mode the flag, the settings or the built-in default picked. */
function launch(view: PolicyView, plan: Launch): StartingMode {
  const { chosen, wanted, input } = plan;
  const gate = backgroundGate(view, input, wanted);
  if (gate === 'refuse') return refuse(BYPASS_NOT_ACCEPTED);
  const ignored = gate === 'ignore';
  const mode = modeOf(wanted, ignored, plan);
  return {
    outcome: 'started',
    mode,
    source: chosen.mode === undefined ? 'built-in' : chosen.source,
    ...cycleOf(mode, ignored, plan),
    notices: startNotices({
      hipaa: input.hipaa === true,
      terminal: input.surface === 'terminal',
      builtIn: chosen.mode === undefined,
    }),
    issues: [...chosen.issues, ...(ignored ? [warning('permissions', BYPASS_IGNORED_NOTICE)] : [])],
  };
}

/** Why a start in `bypassPermissions` is refused whatever picked it, or `undefined`. */
function bypassRefusal(input: StartInput, wanted: PermissionMode): string | undefined {
  if (wanted !== BYPASS) return undefined;
  if (input.restricted === true) return BYPASS_RESTRICTED;
  return input.privileged === true ? BYPASS_AS_ROOT : undefined;
}

/**
 * The mode a session starts in. The first of these applies: the flag, `permissions.defaultMode`,
 * the built-in default; `disableAutoMode` turns an `auto` start (from any of the three) into
 * `default`, and `permissions.disableBypassPermissionsMode` rejects the flag.
 */
export function startingMode(
  view: PolicyView,
  settings: StartSettings,
  input: StartInput,
): StartingMode {
  const flag = fromFlag(input);
  if (flag !== undefined && 'reason' in flag) return refuse(flag.reason);
  const locks = {
    noAuto: settings.disableAutoMode,
    noBypass: settings.disableBypassPermissionsMode,
    skipWarning: settings.skipDangerousModePermissionPrompt,
  };
  if (flag?.mode === BYPASS && locks.noBypass) return refuse(BYPASS_LOCKED);
  const chosen = flag ?? fromSettings(view, input.surface);
  const wanted = chosen.mode ?? builtIn(input, settings);
  const refusal = locks.noBypass ? undefined : bypassRefusal(input, wanted);
  return refusal === undefined ? launch(view, { chosen, wanted, locks, input }) : refuse(refusal);
}
