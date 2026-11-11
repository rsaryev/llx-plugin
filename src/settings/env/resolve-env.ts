import { REPOSITORY_FILES, admits } from '../key-spec.ts';
import { orderedLayers, type PolicyLayer, type PolicyScope } from '../layers.ts';
import { envText, ignoredBecause, turnsTelemetryOff } from './ignored-variables.ts';
import type { IgnoreReason } from './ignored-variables.ts';
import { isRecord } from '../../protocol/is-record.ts';

/**
 * What the `env` blocks of the settings files come to for a session (settings-reference.md, `env`:
 * "How `env` values interact with your shell", "When Claude Code applies `env` values", "Variables
 * Claude Code ignores in `env`"; env-vars.md, "Set variables in settings files" and "Precedence").
 * Pure over data: the host passes its environment and what it knows of trust, and writes the result
 * into the process it starts.
 */
export interface EnvTrust {
  /** An interactive session; `claude -p` and an SDK session never show the trust dialog. */
  readonly interactive: boolean;
  /** The user accepted the trust dialog for the folder or a parent folder whose trust extends to it. */
  readonly trusted: boolean;
}

export type Variables = Readonly<Record<string, string | undefined>>;

export interface EnvInput {
  /** The settings layers, read by `readSettingsLayer`. */
  readonly layers: readonly PolicyLayer[];
  readonly trust: EnvTrust;
  /** The environment `claude` was started from. */
  readonly shell: Variables;
  /**
   * The launch environment the Claude Desktop app or a self-hosted environment runner builds: it
   * "takes precedence instead", so no settings file overwrites a variable it sets.
   */
  readonly launchEnvironment?: Variables;
  /**
   * The variables "Claude Code classifies as safe, such as model selection, timeouts and limits, and
   * feature toggles", applied at startup from every settings file. The docs name no list, so the host
   * supplies the classification; by default none is safe and a repository's `env` waits for trust.
   */
  readonly isSafeAtStartup?: (name: string) => boolean;
  /** The host's variable names are case-insensitive (Windows): the lists and the environments compare without case. */
  readonly windows?: boolean;
}

/** Why a settings value did not reach the session. */
export type NotApplied = IgnoreReason | 'launch-environment' | 'shell-keeps-it' | 'awaiting-trust';

export interface NotAppliedVariable {
  readonly name: string;
  readonly scope: PolicyScope;
  readonly why: NotApplied;
}

export interface EnvResolution {
  /** What the files come to, by variable: the highest file's value. */
  readonly settings: Readonly<Record<string, string>>;
  /** The file each of `settings` came from. */
  readonly origin: Readonly<Record<string, PolicyScope>>;
  /** The environment Claude Code's own process reads. */
  readonly process: Readonly<Record<string, string>>;
  /** The environment every subprocess it starts inherits. */
  readonly subprocess: Readonly<Record<string, string>>;
  /** The values left out, with the reason; the debug log names each one. */
  readonly notApplied: readonly NotAppliedVariable[];
}

/**
 * "`NO_COLOR` and `FORCE_COLOR` set here reach only subprocesses": the interface colors of Claude
 * Code itself are chosen from the shell it was launched from.
 */
export const SUBPROCESS_ONLY: readonly string[] = ['NO_COLOR', 'FORCE_COLOR'];

const defined = (variables: Variables): [string, string][] =>
  Object.entries(variables).flatMap(([name, value]): [string, string][] =>
    value === undefined ? [] : [[name, value]],
  );

/** Whether the files of `scope` take effect at startup in this session, or only after the folder is trusted. */
export const appliesAtStartup = (scope: PolicyScope, trust: EnvTrust): boolean =>
  !REPOSITORY_FILES.includes(scope) || trust.trusted || !trust.interactive;

interface Candidate {
  readonly name: string;
  readonly value: string;
  readonly scope: PolicyScope;
}

/**
 * The `env` entries of one layer the key's row lets its scope carry (settings-reference.md, `env`:
 * "Any file"; an `--add-dir` directory carries two keys only, permissions.md).
 */
function entriesOf(layer: PolicyLayer): readonly [string, unknown][] {
  const { env } = layer.settings;
  return isRecord(env) && admits('env', layer.scope, env) ? Object.entries(env) : [];
}

/** Whether `variables` sets `name`: on a Windows host whatever the case of the name. */
function sets(variables: Variables | undefined, name: string, windows: boolean): boolean {
  if (variables === undefined) return false;
  if (!windows) return variables[name] !== undefined;
  const wanted = name.toUpperCase();
  return Object.entries(variables).some(
    ([set, value]) => value !== undefined && set.toUpperCase() === wanted,
  );
}

/** How one resolution decides: when a file's values start to apply, and against which environments. */
interface Rules {
  readonly startsNow: (scope: PolicyScope) => boolean;
  readonly input: Omit<EnvInput, 'layers' | 'trust'>;
}

/** Why a candidate is left out of the session, when it is. */
function reasonToSkip(candidate: Candidate, rules: Rules): NotApplied | undefined {
  const { name, value, scope } = candidate;
  const { input } = rules;
  const windows = input.windows ?? false;
  const dropped = ignoredBecause(scope, name, value, windows);
  if (dropped !== undefined) return dropped;
  if (sets(input.launchEnvironment, name, windows)) return 'launch-environment';
  // "Such a value overrides the same variable in your user settings, but not one that the
  // environment you start Claude Code from ... sets".
  if (REPOSITORY_FILES.includes(scope) && turnsTelemetryOff(name, value, windows)) {
    if (sets(input.shell, name, windows)) return 'shell-keeps-it';
  }
  return rules.startsNow(scope) || input.isSafeAtStartup?.(name) === true
    ? undefined
    : 'awaiting-trust';
}

type FilesResolution = Pick<EnvResolution, 'settings' | 'origin' | 'notApplied'>;

/** What the `env` blocks of the layers come to, the highest file's value winning for a variable. */
export function resolveEnvBlocks(layers: readonly PolicyLayer[], rules: Rules): FilesResolution {
  // Maps, so a JSON-parsed `__proto__` name stays a name.
  const settings = new Map<string, string>();
  const origin = new Map<string, PolicyScope>();
  const notApplied: NotAppliedVariable[] = [];
  // Lowest precedence first, so a higher file's value replaces a lower one's.
  for (const layer of orderedLayers(layers).toReversed()) {
    const { scope } = layer;
    for (const [name, one] of entriesOf(layer)) {
      // A layer a host built without `readSettingsLayer` gets the same text the reader gives.
      const value = envText(one);
      const why = reasonToSkip({ name, value, scope }, rules);
      if (why !== undefined) notApplied.push({ name, scope, why });
      else {
        settings.set(name, value);
        origin.set(name, scope);
      }
    }
  }
  return {
    settings: Object.fromEntries(settings),
    origin: Object.fromEntries(origin),
    notApplied,
  };
}

/** The process environments a session has once `settings` are written over `base`. */
function composeEnvironments(
  base: Variables,
  settings: Readonly<Record<string, string>>,
): Pick<EnvResolution, 'process' | 'subprocess'> {
  const inherited = Object.fromEntries(defined(base));
  const own = Object.fromEntries(
    Object.entries(settings).filter(([name]) => !SUBPROCESS_ONLY.includes(name)),
  );
  return { process: { ...inherited, ...own }, subprocess: { ...inherited, ...settings } };
}

/**
 * The environment of a session: the shell's, with the `env` of the settings files written over it,
 * "the highest-precedence one" for a variable more than one file sets.
 */
export function resolveEnv(input: EnvInput): EnvResolution {
  const { layers, trust, ...rest } = input;
  const files = resolveEnvBlocks(layers, {
    startsNow: (scope) => appliesAtStartup(scope, trust),
    input: rest,
  });
  const base: Variables = { ...input.shell, ...input.launchEnvironment };
  return { ...files, ...composeEnvironments(base, files.settings) };
}

/**
 * Whether a variable counts as unset: "To cancel a shell export, set the variable to `""`. Claude Code
 * treats an empty value as unset for provider selection, and subprocesses inherit the empty value."
 */
export const isUnsetForProvider = (environment: Variables, name: string): boolean =>
  (environment[name] ?? '') === '';
