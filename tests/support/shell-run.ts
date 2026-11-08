/** Helpers for the tests of `runInjections`: a scripted runner and a fixed permission answer. */
import type { PermissionBehavior } from '../../src/protocol/official.ts';
import {
  runInjections,
  type InjectionContext,
  type PlannedCommand,
  type ShellCall,
} from '../../src/skills/shell-run.ts';
import type { ScratchFiles } from '../../src/ports/index.ts';
import type {
  SkillCommandResult,
  SkillCommandRun,
  SkillCommandRunner,
} from '../../src/skills/shell-ports.ts';
import { scriptedRunner, type RunnerReply } from './ports.ts';

export const base: InjectionContext = {
  name: '/pr-summary',
  shell: 'bash',
  cwd: '/work/app',
  env: { PATH: '/bin' },
  grants: [],
  mode: undefined,
  forkedWithAgent: false,
  signal: new AbortController().signal,
};

export const plan = (command: string): PlannedCommand => ({
  pattern: `!\`${command}\``,
  command,
});

export interface Setup {
  readonly context?: Partial<InjectionContext>;
  readonly behavior?: PermissionBehavior;
}

/** Run `commands` against the scripted `replies`; every permission question is answered `behavior`. */
export async function run(
  commands: readonly string[],
  replies: readonly RunnerReply[],
  setup: Setup = {},
) {
  const runner = scriptedRunner(...replies);
  const asked: ShellCall[] = [];
  const result = await runInjections(
    commands.map(plan),
    { ...base, ...setup.context },
    {
      runner,
      permissions: (call) => {
        asked.push(call);
        return setup.behavior ?? 'allow';
      },
    },
  );
  return { result, runner, asked };
}

/** The message of a failed run; the test fails on a success. */
export const failure = (result: Awaited<ReturnType<typeof run>>['result']): string => {
  if (result.ok) throw new Error('expected a failure');
  return result.issue.message;
};

/** A runner that answers every run with `result` and records what it was asked. */
export function fixedRunner(
  result: Partial<SkillCommandResult>,
): SkillCommandRunner & { readonly calls: SkillCommandRun[] } {
  const calls: SkillCommandRun[] = [];
  return {
    calls,
    run: (given) => {
      calls.push(given);
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '', timedOut: false, ...result });
    },
  };
}

/** Runs one command through `runner`, with an optional scratch port and the given context. */
export async function runThrough(
  runner: SkillCommandRunner,
  command: string,
  setup: Setup & { readonly scratch?: ScratchFiles } = {},
) {
  return runInjections(
    [plan(command)],
    { ...base, ...setup.context },
    {
      runner,
      permissions: () => setup.behavior ?? 'allow',
      ...(setup.scratch === undefined ? {} : { scratch: setup.scratch }),
    },
  );
}
