import { warning, type PluginIssue } from '../../format/issues.ts';
import type { HookEvent } from '../../protocol/official.ts';
import type { EventFactsOf } from '../contracts.ts';
import {
  normalizeBackgroundTasks,
  normalizeSessionCrons,
  type BackgroundTask,
  type SessionCron,
} from './background-tasks.ts';

/**
 * Fields an event's input has only in some cases (hooks.md, the input tables). A host that supplies
 * one where the docs say it is absent gets it dropped, with a warning, so a hook never sees a field
 * Claude Code would not send.
 */

interface Refined<E extends HookEvent> {
  readonly facts: EventFactsOf<E>;
  readonly issues: readonly PluginIssue[];
}
type Rule<E extends HookEvent> = (facts: EventFactsOf<E>) => Refined<E>;

/** `facts` without the named fields, and a warning for each one that was there. */
function dropFields<E extends HookEvent>(
  event: E,
  facts: EventFactsOf<E>,
  fields: readonly string[],
  because: string,
): Refined<E> {
  const present = fields.filter((field) => field in facts);
  if (present.length === 0) return { facts, issues: [] };
  const kept: EventFactsOf<E> = { ...facts };
  for (const field of present) Reflect.deleteProperty(kept, field);
  const issues = present.map((field) =>
    warning(`hooks.${event}.input.${field}`, `"${field}" is only sent ${because} and is dropped`),
  );
  return { facts: kept, issues };
}

/**
 * `InstructionsLoaded`: `globs` "Present only for `path_glob_match` loads", `trigger_file_path`
 * "for lazy loads" (`nested_traversal`, `path_glob_match`), `parent_file_path` "for `include` loads".
 */
type LoadField = 'globs' | 'trigger_file_path' | 'parent_file_path';
const LOAD_FIELDS: {
  readonly [R in EventFactsOf<'InstructionsLoaded'>['load_reason']]: readonly LoadField[];
} = {
  session_start: [],
  nested_traversal: ['trigger_file_path'],
  path_glob_match: ['globs', 'trigger_file_path'],
  include: ['parent_file_path'],
  compact: [],
};
const ALL_LOAD_FIELDS: readonly LoadField[] = ['globs', 'trigger_file_path', 'parent_file_path'];

const instructionsLoaded: Rule<'InstructionsLoaded'> = (facts) => {
  const reason = facts.load_reason;
  const unwanted = ALL_LOAD_FIELDS.filter((field) => !LOAD_FIELDS[reason].includes(field));
  return dropFields('InstructionsLoaded', facts, unwanted, `for a matching load (not ${reason})`);
};

/**
 * `SessionStart`: when `source` is `"resume"` or `"fork"` the hook also receives the four cost
 * fields; for any other source they are absent.
 */
const COST_FIELDS = [
  'seconds_since_last_response',
  'context_tokens',
  'prompt_cache_likely_expired',
  'estimated_cache_write_usd',
] as const;

const HAS_COST_FIELDS: { readonly [S in EventFactsOf<'SessionStart'>['source']]: boolean } = {
  startup: false,
  resume: true,
  clear: false,
  compact: false,
  fork: true,
};

const sessionStart: Rule<'SessionStart'> = (facts) =>
  HAS_COST_FIELDS[facts.source]
    ? { facts, issues: [] }
    : dropFields('SessionStart', facts, COST_FIELDS, 'when the session is resumed or forked');

interface StopShape {
  readonly background_tasks?: readonly BackgroundTask[];
  readonly session_crons?: readonly SessionCron[];
}

/** `Stop` and `SubagentStop`: capped free text and per-type task fields. */
function refineStop<F extends StopShape>(
  event: 'Stop' | 'SubagentStop',
  facts: F,
): { readonly facts: F; readonly issues: readonly PluginIssue[] } {
  const issues: PluginIssue[] = [];
  let refined: F = facts;
  if (facts.background_tasks !== undefined) {
    const tasks = normalizeBackgroundTasks(
      facts.background_tasks,
      `hooks.${event}.input.background_tasks`,
    );
    issues.push(...tasks.issues);
    refined = { ...refined, background_tasks: tasks.tasks };
  }
  if (facts.session_crons !== undefined) {
    refined = { ...refined, session_crons: normalizeSessionCrons(facts.session_crons) };
  }
  return { facts: refined, issues };
}

const CONDITIONAL_FIELDS: { readonly [E in HookEvent]?: Rule<E> } = {
  InstructionsLoaded: instructionsLoaded,
  SessionStart: sessionStart,
  Stop: (facts) => refineStop('Stop', facts),
  SubagentStop: (facts) => refineStop('SubagentStop', facts),
};

/** `facts` as `event`'s input has them: the conditional fields kept or dropped as the docs say. */
export function applyConditionalFields<E extends HookEvent>(
  event: E,
  facts: EventFactsOf<E>,
): Refined<E> {
  const rule: Rule<E> | undefined = CONDITIONAL_FIELDS[event];
  return rule === undefined ? { facts, issues: [] } : rule(facts);
}
