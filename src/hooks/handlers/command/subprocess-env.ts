import { applySettingsEnv } from '../../../settings/index.ts';
import { scrubEnvironment } from '../../../loading/resolve/subprocess-scrub.ts';

/**
 * The environment of a subprocess Claude Code starts (env-vars.md, "Set variables in settings files",
 * "Precedence", `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`, `CLAUDECODE`, `CLAUDE_CODE_CHILD_SESSION`,
 * `CLAUDE_CODE_SESSION_ID` and `CLAUDE_PID`; hooks.md, "Common input fields"): the host's environment
 * with the settings files' `env` written over it, its credentials removed when the scrub is on, the
 * `OTEL_*` exporter variables removed ("from every subprocess it spawns"), and the variables Claude
 * Code sets for that kind of subprocess. One pure function, so a host builds the environment of its
 * own Bash, PowerShell, stdio MCP and Monitor processes the way the kit builds a hook's.
 *
 * Which kind gets which variable is the docs' own list:
 *
 * | variable                    | hook | Bash | PowerShell | stdio MCP | Monitor |
 * | --------------------------- | ---- | ---- | ---------- | --------- | ------- |
 * | `CLAUDECODE`                | yes  | yes  | yes        | yes       | yes     |
 * | `CLAUDE_CODE_CHILD_SESSION` | yes  | yes  | yes        | no        | yes     |
 * | `CLAUDE_CODE_SESSION_ID`    | yes  | yes  | yes        | yes       | no      |
 * | `CLAUDE_PID`                | yes  | yes  | yes        | no        | no      |
 * | `CLAUDE_EFFORT`             | yes  | yes  | no         | no        | no      |
 *
 * Judgments (spec/judgments.md): `CLAUDECODE` is set for a Monitor process too (the docs list the
 * tools that get it by example); a variable the table does not give a kind is neither set nor
 * removed when the host's own environment holds it; `CLAUDE_ENV_FILE` of the host's environment
 * reaches no subprocess (a hook gets the file of its event from `processEnvironment`, a Bash command
 * runs the files); a variable of a session or process id the host did not give is not set.
 */

export const SUBPROCESS_KINDS = ['hook', 'bash', 'powershell', 'mcp', 'monitor'] as const;
export type SubprocessKind = (typeof SUBPROCESS_KINDS)[number];

/** Which of the optional variables a kind of subprocess gets. */
interface KindVariables {
  readonly childSession: boolean;
  readonly sessionId: boolean;
  readonly processId: boolean;
  /** env-vars.md, `CLAUDE_EFFORT`: "Set automatically in Bash tool subprocesses and hook commands". */
  readonly effort: boolean;
}

const KIND_VARIABLES: { readonly [K in SubprocessKind]: KindVariables } = {
  hook: { childSession: true, sessionId: true, processId: true, effort: true },
  bash: { childSession: true, sessionId: true, processId: true, effort: true },
  powershell: { childSession: true, sessionId: true, processId: true, effort: false },
  mcp: { childSession: false, sessionId: true, processId: false, effort: false },
  monitor: { childSession: true, sessionId: false, processId: false, effort: false },
};

export interface SubprocessEnvironmentInput {
  readonly kind: SubprocessKind;
  /** The host process's environment. */
  readonly environment: Readonly<Record<string, string>>;
  /** `resolveSettingsEnv(...).values`: written over `environment`. */
  readonly settingsEnv?: Readonly<Record<string, string>>;
  /** The host's variable names are case-insensitive. */
  readonly windows: boolean;
  /** The session's id, for `CLAUDE_CODE_SESSION_ID`. */
  readonly sessionId?: string | undefined;
  /** The host process's id, for `CLAUDE_PID`. */
  readonly processId?: number | undefined;
  /** The effort level when the process starts, for `CLAUDE_EFFORT` ("only set when the model supports" it). */
  readonly effort?: string | undefined;
}

const OTEL = /^OTEL_/;
const OTEL_ANY_CASE = /^OTEL_/i;
const ENV_FILE = 'CLAUDE_ENV_FILE';

/** The variables Claude Code sets for this kind of subprocess. */
function setByClaudeCode(input: SubprocessEnvironmentInput): Record<string, string> {
  const kind = KIND_VARIABLES[input.kind];
  return {
    CLAUDECODE: '1',
    ...(kind.childSession ? { CLAUDE_CODE_CHILD_SESSION: '1' } : {}),
    ...(kind.sessionId && input.sessionId !== undefined
      ? { CLAUDE_CODE_SESSION_ID: input.sessionId }
      : {}),
    ...(kind.processId && input.processId !== undefined
      ? { CLAUDE_PID: String(input.processId) }
      : {}),
    ...(kind.effort && input.effort !== undefined ? { CLAUDE_EFFORT: input.effort } : {}),
  };
}

/** The environment a subprocess of this kind inherits, with what Claude Code sets for it. */
export function subprocessEnvironment(input: SubprocessEnvironmentInput): Record<string, string> {
  const { windows } = input;
  const parent = applySettingsEnv(input.environment, input.settingsEnv ?? {}, windows);
  const scrubbed = scrubEnvironment(parent);
  const exporter = windows ? OTEL_ANY_CASE : OTEL;
  const isEnvFile = (name: string): boolean => (windows ? name.toUpperCase() : name) === ENV_FILE;
  const inherited = Object.entries(scrubbed).filter(
    ([name]) => !exporter.test(name) && !isEnvFile(name),
  );
  return { ...Object.fromEntries(inherited), ...setByClaudeCode(input) };
}
