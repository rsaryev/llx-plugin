import type { CommandRunner } from '../../ports/command-runner.ts';
import type { BaseHookInput, Settings } from '../../protocol/official.ts';
import { isRecord } from '../../protocol/is-record.ts';

/**
 * Running a `subagentStatusLine` (statusline.md, "Subagent status lines"): what the command reads on
 * stdin and how its lines rewrite the subagent rows. Which line runs, under which gates, is
 * `readSubagentStatusLine`; when a refresh tick fires, the environment the command gets and how a
 * row body is drawn stay the host's. statusline.md is outside the requirement set, so each rule
 * here is a judgment (spec/judgments.md).
 */

/**
 * One entry of `tasks` (statusline.md, "Task fields"); the SDK has no type for it. Fields marked
 * optional "are omitted when they have no value".
 */
export interface SubagentStatusTask {
  /** "Echo it as `id` in the line you write back for this row." */
  readonly id: string;
  readonly name?: string;
  readonly type: 'local_agent';
  /** The value hooks receive as `agent_type`. */
  readonly agentType: string;
  /** Such as `running`, `completed`, `failed`, or `killed`. */
  readonly status: string;
  readonly description: string;
  /** A short progress summary, otherwise the same text as `description`. */
  readonly label: string;
  /** Milliseconds since the Unix epoch. */
  readonly startTime: number;
  readonly model?: string;
  /** `low`, `medium`, `high`, `xhigh`, `max`, or a numeric token budget. */
  readonly effort?: string | number;
  readonly contextWindowSize?: number;
  readonly tokenCount: number;
  /** "Up to the last 16 `tokenCount` readings, one per refresh tick, oldest first." */
  readonly tokenSamples: readonly number[];
  readonly cwd: string;
}

/** "The base hook fields, a `columns` field with the usable row width, and a `tasks` array." */
export type SubagentStatusLineInput = BaseHookInput & {
  readonly columns: number;
  readonly tasks: readonly SubagentStatusTask[];
};

const MAX_TOKEN_SAMPLES = 16;

/** The stdin object of one tick, each row's `tokenSamples` cut to its last 16 readings. */
export const subagentStatusLineInput = (
  base: BaseHookInput,
  columns: number,
  tasks: readonly SubagentStatusTask[],
): SubagentStatusLineInput => ({
  ...base,
  columns,
  tasks: tasks.map((task) => ({
    ...task,
    tokenSamples: task.tokenSamples.slice(-MAX_TOKEN_SAMPLES),
  })),
});

/** One printed line as a row, or `undefined` for a line that is not `{"id","content"}` JSON. */
function rowOf(line: string): { readonly id: string; readonly content: string } | undefined {
  try {
    const parsed: unknown = JSON.parse(line);
    if (!isRecord(parsed)) return undefined;
    const { id, content } = parsed;
    return typeof id === 'string' && typeof content === 'string' ? { id, content } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The rows the command rewrote, by task id: each body exactly as printed (ANSI and OSC 8 kept), an
 * empty one meaning the row is hidden. A row it does not name keeps the default and is absent.
 * Judgment: a line that is not such a JSON object, or names no visible task, is skipped, and a later
 * line for the same id wins.
 */
export function readSubagentStatusRows(
  stdout: string,
  tasks: readonly Pick<SubagentStatusTask, 'id'>[],
): ReadonlyMap<string, string> {
  const visible = new Set(tasks.map((task) => task.id));
  const rows = new Map<string, string>();
  for (const line of stdout.split('\n')) {
    const row = rowOf(line.trim());
    if (row !== undefined && visible.has(row.id)) rows.set(row.id, row.content);
  }
  return rows;
}

/** What one run needs beyond the line: the stdin object and the whole environment of the process. */
export interface SubagentStatusLineRun {
  readonly input: SubagentStatusLineInput;
  readonly env: Readonly<Record<string, string>>;
}

/**
 * Runs the line once over `run.input` through the `CommandRunner` and reads its rows. Judgment: the
 * command is a `bash` line (a host on Windows maps it to Git Bash or PowerShell, statusline.md
 * "Windows configuration"), run from `input.cwd` with no time limit of its own (the host cancels a
 * run a new tick replaces through `signal`); like the main status line ("displays your script's
 * output only after the script exits with code 0"), a run that does not exit 0 rewrites no row.
 */
export async function runSubagentStatusLine(
  line: NonNullable<Settings['subagentStatusLine']>,
  run: SubagentStatusLineRun,
  runner: CommandRunner,
  { signal }: { readonly signal: AbortSignal },
): Promise<ReadonlyMap<string, string>> {
  const result = await runner.run({
    spec: { form: 'shell', command: line.command, shell: 'bash' },
    cwd: run.input.cwd,
    env: run.env,
    stdin: JSON.stringify(run.input),
    signal,
  });
  return result.exitCode === 0 ? readSubagentStatusRows(result.stdout, run.input.tasks) : new Map();
}
