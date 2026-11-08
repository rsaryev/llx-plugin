import type { PluginIssue } from '../../src/format/issues.ts';
import {
  runCommandSource,
  type CommandSourcePorts,
  type CommandSourceSetting,
} from '../../src/marketplace/command-source.ts';
import type { CommandFetchPlan } from '../../src/marketplace/types.ts';
import type { PluginFiles } from '../../src/ports/index.ts';
import { directoriesAt } from './marketplace-ports.ts';
import { fakeEnvironment, locations, memoryFiles, scriptedRunner } from './ports.ts';
import type { RunnerReply } from './runner.ts';

/** Helpers of the `command` source tests: a run through fakes of every port it takes. */
export const PRINTED = '/opt/tool/out';
const signal = new AbortController().signal;
export const plugin = (): PluginFiles =>
  memoryFiles({ '.claude-plugin/plugin.json': '{}', 'skills/a/SKILL.md': 'x' });

const plan = (rest: Partial<CommandFetchPlan> = {}): CommandFetchPlan => ({
  kind: 'command',
  command: 'my-tool claude-plugin-path',
  shell: 'sh',
  cwd: 'home',
  timeoutMs: 120_000,
  mode: 'copy',
  ...rest,
});

export function run(
  reply: RunnerReply,
  options: {
    plan?: Partial<CommandFetchPlan>;
    folders?: Readonly<Record<string, PluginFiles>>;
    setting?: Partial<CommandSourceSetting>;
  } = {},
) {
  const runner = scriptedRunner(reply);
  const directories = directoriesAt(options.folders ?? { [PRINTED]: plugin() });
  const ports: CommandSourcePorts = {
    runner,
    environment: fakeEnvironment({ PATH: '/bin', HOME: '/home/user' }),
    locations: locations({ home: '/home/user' }),
    directories,
  };
  const setting: CommandSourceSetting = {
    platform: 'posix',
    sessionCwd: '/work/app',
    ...options.setting,
  };
  const result = runCommandSource(plan(options.plan), ports, setting, signal);
  return { result, runner, directories };
}

export const issueOf = async (result: ReturnType<typeof run>['result']): Promise<PluginIssue> => {
  const value = await result;
  if (!('severity' in value)) throw new Error('expected an issue');
  return value;
};

export const prints = (stdout: string): RunnerReply => ({ exitCode: 0, stdout });

/** A plugin folder with `count` files under `skills/`. */
export const filesUnderSkills = (count: number): PluginFiles =>
  memoryFiles(
    Object.fromEntries(Array.from({ length: count }, (_, index) => [`skills/f${index}`, 'x'])),
  );
