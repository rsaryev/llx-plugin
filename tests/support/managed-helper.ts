/** One run of a policy helper over a scripted process, for the helper tests. */
import {
  runPolicyHelper,
  type HelperPhase,
  type HelperRun,
  type PathFlavor,
} from '../../src/settings/managed/index.ts';
import { fileProbe } from './managed.ts';
import { fixedClock, scriptedRunner, type RunnerReply } from './ports.ts';

export const PATH = '/usr/local/bin/claude-policy';
export const helper = { path: PATH, timeoutMs: 5000 };

export interface Setup {
  readonly reply?: RunnerReply;
  readonly files?: readonly string[];
  readonly flavor?: PathFlavor;
  readonly phase?: HelperPhase;
  readonly path?: string;
  readonly slow?: number;
}

/** One run of the helper over a scripted process. */
export async function run(setup: Setup = {}) {
  const clock = fixedClock(1000);
  const runner = scriptedRunner(setup.reply ?? { stdout: '{}' });
  const path = setup.path ?? PATH;
  const result = await runPolicyHelper({
    helper: { ...helper, path },
    host: {
      runner,
      probe: fileProbe(setup.files ?? [path], {
        clock,
        ...(setup.slow === undefined ? {} : { slow: setup.slow }),
      }),
      clock,
      env: { HOME: '/home/dev' },
      cwd: '/work',
      version: '2.1.319',
    },
    flavor: setup.flavor ?? 'posix',
    phase: setup.phase ?? 'startup',
    signal: new AbortController().signal,
  });
  return { result, runner };
}

export const failed = (result: HelperRun) => (result.ok ? undefined : result);
export const envelope = (managedSettings: unknown) => ({
  stdout: JSON.stringify({ managedSettings }),
});
