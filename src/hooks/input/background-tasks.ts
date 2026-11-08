import { warning, type PluginIssue } from '../../format/issues.ts';
import type { EventFactsOf } from '../contracts.ts';

/**
 * The `background_tasks` and `session_crons` of a `Stop` or `SubagentStop` input (hooks.md, "Stop
 * input"): free text is "capped at 1000 characters with an in-string `… [+N chars]` marker when
 * clipped", and the fields only some task types have are "present only for" those types.
 */

type StopFacts = EventFactsOf<'Stop'>;
export type BackgroundTask = NonNullable<StopFacts['background_tasks']>[number];
export type SessionCron = NonNullable<StopFacts['session_crons']>[number];

const TEXT_CAP = 1000;

/**
 * The text clipped to {@link TEXT_CAP} characters (Unicode code points, so a surrogate pair is not
 * split) with `… [+N chars]` appended, `N` being the characters cut. A text within the cap stays as
 * it is (spec/judgments.md: the docs do not say whether the marker counts toward the cap).
 */
function capText(text: string): string {
  if (text.length <= TEXT_CAP) return text;
  const characters = Array.from(text);
  if (characters.length <= TEXT_CAP) return text;
  const cut = characters.length - TEXT_CAP;
  return `${characters.slice(0, TEXT_CAP).join('')}… [+${cut} chars]`;
}

type TaskField = 'command' | 'agent_type' | 'server' | 'tool' | 'name';

/** The fields each task type carries beyond `id`, `type`, `status` and `description`. */
const TASK_FIELDS: ReadonlyMap<string, readonly TaskField[]> = new Map([
  ['shell', ['command']],
  ['subagent', ['agent_type']],
  ['monitor', ['server', 'tool']],
  ['MCP task', ['server', 'tool']],
  ['workflow', ['name']],
]);

const TYPED_FIELDS: readonly TaskField[] = ['command', 'agent_type', 'server', 'tool', 'name'];

function normalizeTask(task: BackgroundTask, path: string, issues: PluginIssue[]): BackgroundTask {
  const allowed = TASK_FIELDS.get(task.type) ?? [];
  const kept: BackgroundTask = {
    ...task,
    description: capText(task.description),
    ...(task.command === undefined ? {} : { command: capText(task.command) }),
  };
  for (const field of TYPED_FIELDS) {
    if (task[field] === undefined || allowed.includes(field)) continue;
    Reflect.deleteProperty(kept, field);
    issues.push(warning(`${path}.${field}`, `"${field}" is not sent for a "${task.type}" task`));
  }
  return kept;
}

/** Each task capped and stripped of the fields its type does not have; unknown types keep none. */
export function normalizeBackgroundTasks(
  tasks: readonly BackgroundTask[],
  path: string,
): { readonly tasks: BackgroundTask[]; readonly issues: readonly PluginIssue[] } {
  const issues: PluginIssue[] = [];
  return {
    tasks: tasks.map((task, index) => normalizeTask(task, `${path}[${index}]`, issues)),
    issues,
  };
}

/** Each cron with its prompt capped. */
export const normalizeSessionCrons = (crons: readonly SessionCron[]): SessionCron[] =>
  crons.map((cron) => ({ ...cron, prompt: capText(cron.prompt) }));
