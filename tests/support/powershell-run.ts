/** Helpers for the tests of hooks that run in PowerShell (hooks/handlers/command). */
import { interpretRun, runHandler } from '../../src/hooks/index.ts';
import type { RawRun } from '../../src/hooks/handlers/index.ts';
import type { HookHandler } from '../../src/protocol/hook-config.ts';
import type { HookEvent } from '../../src/protocol/official.ts';
import { entry, FACTS } from './hooks-select.ts';
import { runContext, type settingsCommand } from './hooks-run.ts';
import { scriptedRunner } from './ports.ts';
import { windowsLocations } from './windows-locations.ts';

export type Options = Partial<Parameters<typeof runContext>[0]>;

export async function run(hook: ReturnType<typeof settingsCommand>, options: Options = {}) {
  const runner = scriptedRunner({});
  const result = await runHandler(hook, runContext({ runner, ...options }));
  return { result, calls: runner.calls };
}

/** A hook that ran with PowerShell as the host's default shell: Windows without Git Bash. */
export const noGitBash = {
  windows: true,
  defaultShell: 'powershell',
  locations: windowsLocations(),
} as const;

export const MESSAGE =
  "blocking because Git Bash wasn't found, so only exit code 0 or 2 counts as this hook's verdict.";

/** The verdict of one raw run of a hook on Windows without Git Bash, as the engine reads it. */
export const verdict = (event: HookEvent, hook: HookHandler, raw: RawRun, gitBashMissing = true) =>
  interpretRun(entry(event, { handler: hook }), raw, {
    event,
    facts: FACTS[event],
    parse: (_event, json) => ({ output: Object(json) }),
    gitBashMissing,
  });
