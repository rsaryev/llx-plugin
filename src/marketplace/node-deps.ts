import { error, type PluginIssue } from '../format/issues.ts';
import { isWithin } from '../format/link-rule.ts';
import type { CommandRun } from '../ports/command-runner.ts';
import { ARGUMENTS, CHECKS, isReady, prepare, type Ready } from './node-deps-checks.ts';
import {
  INSTALL_TIMEOUT_MS,
  type NodeDepsInput,
  type NodeDepsInstall,
  type NodeDepsResult,
} from './node-deps-types.ts';

/**
 * The plan of a plugin's Node.js package install (plugins/loading.md, "Node.js package dependencies").
 * Pure: `NodeDepsInput` in, a plan out; the host copies the two files, runs the command through
 * `CommandRunner` and moves `node_modules` (docs/API.md, "Node.js package dependencies").
 */

function installOf(ready: Ready, input: NodeDepsInput): NodeDepsInstall {
  const { join, installDir, pluginRoot } = input;
  const files = ['package.json', ready.lockfile];
  return {
    action: 'install',
    reason: 'copied-version-directory',
    packageManager: ready.manager,
    lockfile: ready.lockfile,
    frozen: true,
    ignoreScripts: true,
    run: {
      spec: { form: 'exec', command: ready.manager, args: ARGUMENTS[ready.manager] },
      cwd: installDir,
      timeoutMs: INSTALL_TIMEOUT_MS,
    },
    stage: {
      directory: installDir,
      copy: files.map((file) => ({ from: join(pluginRoot, file), to: join(installDir, file) })),
      moveBack: {
        from: join(installDir, 'node_modules'),
        to: join(pluginRoot, 'node_modules'),
        replaceExisting: true,
      },
    },
  };
}

/**
 * Paths of the host, as `PathJoin` makes them: a Windows path (`C:\p\.deps`) and a path in another
 * case name the same folder. The guard errs toward refusing (judgment): a refusal costs a folder
 * with another name, a miss lets the package manager read `.npmrc`, `.env` and `bunfig.toml`.
 */
const comparable = (path: string): string => path.replaceAll('\\', '/').toLowerCase();

/**
 * The install folder must be a folder of its own: "the package manager runs in a folder of its own
 * that holds only a copy of the checked dependency list, so npm and Bun don't read the plugin's
 * `.npmrc`, `.env`, or `bunfig.toml`". A folder that is the plugin or inside it would read them.
 */
const folderIssues = (input: NodeDepsInput): PluginIssue[] =>
  isWithin(comparable(input.pluginRoot), comparable(input.installDir))
    ? [
        error(
          'installDir',
          `The install folder "${input.installDir}" must lie outside the plugin directory "${input.pluginRoot}"`,
        ),
      ]
    : [];

/** Whether and how Claude Code installs a plugin's Node.js packages. */
export function planNodeDepsInstall(input: NodeDepsInput): NodeDepsResult {
  const ready = prepare(input);
  if (!isReady(ready)) return { plan: ready, issues: [] };
  const refused = CHECKS.map((check) => check(ready, input)).find((found) => found !== undefined);
  if (refused !== undefined) return { plan: refused, issues: [] };
  const issues = folderIssues(input);
  return issues.length > 0
    ? { plan: { action: 'skip', reason: 'install-folder', installDir: input.installDir }, issues }
    : { plan: installOf(ready, input), issues: [] };
}

/** The process the host runs for an install: the plan, the host's environment and abort signal; output merged so a failure shows its cause. */
export function nodeDepsRun(
  plan: NodeDepsInstall,
  env: Readonly<Record<string, string>>,
  signal: AbortSignal,
): CommandRun {
  return {
    spec: plan.run.spec,
    cwd: plan.run.cwd,
    env,
    timeoutMs: plan.run.timeoutMs,
    mergeStderr: true,
    signal,
  };
}
