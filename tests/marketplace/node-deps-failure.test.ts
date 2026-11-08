/**
 * plugins/loading.md § When the dependency install fails or is skipped, § Limits on the dependency
 * install ("60-second timeout"); plugins/troubleshooting.md § The packages it lists are not installed
 * or were not installed, because ... What the user sees when the install fails or cannot run, and
 * that the plugin still loads.
 */
import { describe, expect, test } from 'bun:test';
import { blocksLoading } from '../../src/format/issues.ts';
import {
  installOutcome,
  nodeDepsNote,
  updateRetriesInstall,
  type CachedCopy,
} from '../../src/marketplace/node-deps-failure.ts';
import type { NodeDepsPlan } from '../../src/marketplace/node-deps-types.ts';
import { readPackageJson } from '../../src/marketplace/node-deps-spec.ts';
import type { CommandResult } from '../../src/ports/command-runner.ts';
import { bunLock, npmLock } from '../support/node-deps-fixtures.ts';
import { PACKAGE, planned, type Override } from '../support/node-deps-plan.ts';
import { spec } from '../support/spec.ts';

const FAILS = 'install.loading.When the dependency install fails or is skipped';
const NOTES =
  'install.troubleshooting.The packages it lists are not installed or were not installed, because ...';
const ID = 'formatter@my-marketplace';

const plan = (over: Override = {}): NodeDepsPlan => planned(over);

const copy = (over: Partial<CachedCopy> = {}): CachedCopy => ({
  enabled: true,
  hasLockfile: true,
  packageJson: PACKAGE,
  hasNodeModules: false,
  ...over,
});

const because = (over: Override): string => nodeDepsNote(copy(), plan(over), ID)?.text ?? '';

const result = (over: Partial<CommandResult> = {}): CommandResult => ({
  exitCode: 0,
  stdout: '',
  stderr: '',
  timedOut: false,
  ...over,
});

spec(NOTES, () => {
  test('an install that can run but left no node_modules says the packages are not installed and gives the update command', () => {
    const note = nodeDepsNote(copy(), plan(), ID);
    expect(note).toMatchObject({
      kind: 'not-installed',
      updateCommand: `claude plugin update ${ID}`,
    });
    expect(note?.text).toBe(
      `The packages it lists are not installed. To retry, run: claude plugin update ${ID}`,
    );
  });

  test('an install that cannot run says the packages were not installed, because the reason, and updating does not help', () => {
    const note = nodeDepsNote(
      copy({ hasLockfile: true }),
      plan({ lockfiles: {}, otherLockfiles: ['yarn.lock'] }),
      ID,
    );
    expect(note).toMatchObject({ kind: 'not-installed-because' });
    expect(note?.updateCommand).toBeUndefined();
    expect(note?.text).toStartWith('The packages it lists were not installed, because ');
    expect(note?.text).toContain('yarn.lock');
  });

  test('the reasons the docs name: a Yarn, pnpm or bun.lockb lockfile, and a lockfile whose package manager is not installed', () => {
    expect(because({ lockfiles: {}, otherLockfiles: ['yarn.lock'] })).toContain(
      'replace it with an npm lockfile',
    );
    expect(because({ lockfiles: {}, otherLockfiles: ['pnpm-lock.yaml'] })).toContain(
      'replace it with an npm lockfile',
    );
    expect(because({ lockfiles: {}, otherLockfiles: ['bun.lockb'] })).toContain(
      'text bun.lock or an npm lockfile',
    );
    expect(because({ lockfiles: { 'bun.lock': bunLock() }, available: ['npm'] })).toContain(
      'bun is not installed on this computer',
    );
  });

  test('a package manager that is missing is something the user installs, then updates the plugin', () => {
    const note = nodeDepsNote(
      copy(),
      plan({ lockfiles: { 'bun.lock': bunLock() }, available: ['npm'] }),
      ID,
    );
    expect(note?.text).toContain('install it, then update the plugin');
  });

  test('every reason that cannot run names itself in words, none is empty', () => {
    const cases: Override[] = [
      { lockfiles: { 'package-lock.json': npmLock({ version: 1 }) } },
      { packageJson: readPackageJson({ dependencies: { a: 'file:../a', 'left-pad': '^1.3.0' } }) },
      {
        packageJson: readPackageJson({
          dependencies: { 'left-pad': '^1.3.0' },
          overrides: { x: '1' },
        }),
      },
      { packageJson: readPackageJson({ dependencies: { 'left-pad': '^1.0.0' } }) },
      { origin: 'linked' },
      {
        lockfiles: {
          'package-lock.json': npmLock({
            packages: { 'node_modules/y': { version: '1', resolved: 'http://example.com/y.tgz' } },
          }),
        },
      },
    ];
    for (const over of cases) {
      const note = nodeDepsNote(copy(), plan(over), ID);
      expect(note?.kind).toBe('not-installed-because');
      expect(note?.text.length).toBeGreaterThan(60);
    }
  });

  test('no note when node_modules is there, the plugin is not enabled, it has no lockfile or lists no runtime dependencies', () => {
    expect(nodeDepsNote(copy({ hasNodeModules: true }), plan(), ID)).toBeUndefined();
    expect(nodeDepsNote(copy({ enabled: false }), plan(), ID)).toBeUndefined();
    expect(nodeDepsNote(copy({ hasLockfile: false }), plan({ lockfiles: {} }), ID)).toBeUndefined();
    expect(nodeDepsNote(copy({ packageJson: readPackageJson({}) }), plan(), ID)).toBeUndefined();
    expect(
      nodeDepsNote(
        copy({ packageJson: readPackageJson({ devDependencies: { typescript: '5' } }) }),
        plan(),
        ID,
      ),
    ).toBeUndefined();
  });

  test('updating retries only an unfinished install, and not while CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC is set', () => {
    const unfinished = nodeDepsNote(copy(), plan(), ID);
    const stuck = nodeDepsNote(copy(), plan({ lockfiles: {}, otherLockfiles: ['yarn.lock'] }), ID);
    expect(unfinished && updateRetriesInstall(unfinished, false)).toBe(true);
    expect(unfinished && updateRetriesInstall(unfinished, true)).toBe(false);
    expect(stuck && updateRetriesInstall(stuck, false)).toBe(false);
  });
});

spec(FAILS, () => {
  test('the plugin still loads: the note is a warning, never an error that blocks loading', () => {
    for (const over of [{}, { lockfiles: {}, otherLockfiles: ['yarn.lock' as const] }]) {
      const note = nodeDepsNote(copy(), plan(over), ID);
      expect(note?.issues).toHaveLength(1);
      expect(note?.issues[0]).toMatchObject({ severity: 'warning', path: ID });
      expect(blocksLoading(note?.issues ?? [])).toBe(false);
    }
  });

  test('the note appears on an enabled plugin whose cached copy has a lockfile and a package.json that lists runtime dependencies, but no node_modules', () => {
    expect(nodeDepsNote(copy(), plan(), ID)).toBeDefined();
    expect(nodeDepsNote(copy({ packageJson: undefined }), plan(), ID)).toBeUndefined();
  });

  test('a plugin loaded in place has no cached copy and so no note; the user installs the packages there or from a hook into CLAUDE_PLUGIN_DATA', () => {
    expect(nodeDepsNote(copy(), plan({ origin: 'in-place' }), ID)).toBeUndefined();
    expect(nodeDepsNote(copy(), plan({ origin: 'inline' }), ID)).toBeUndefined();
  });

  test('when the automatic install cannot provide a dependency the note points to a hook into the persistent data directory', () => {
    const note = nodeDepsNote(copy(), plan({ lockfiles: {}, otherLockfiles: ['yarn.lock'] }), ID);
    expect(note?.advice).toContain('${CLAUDE_PLUGIN_DATA}');
    expect(nodeDepsNote(copy(), plan(), ID)?.advice).toBeUndefined();
  });

  test('a link-mode plugin without node_modules is told to print a directory that holds the packages', () => {
    const note = nodeDepsNote(copy(), plan({ origin: 'linked' }), ID);
    expect(note?.text).toContain('node_modules');
  });

  test('an install that exits non-zero failed, and its output gives the cause', () => {
    expect(installOutcome(result())).toEqual({ state: 'installed' });
    const failed = installOutcome(
      result({ exitCode: 1, stdout: 'npm error code E404\nnpm error 404 Not Found' }),
    );
    expect(failed).toMatchObject({ state: 'failed', cause: 'exit-code' });
    expect(failed.state === 'failed' && failed.message).toContain('exit code 1');
    expect(failed.state === 'failed' && failed.message).toContain('npm error 404 Not Found');
  });

  test('an install that runs longer than 60 seconds is stopped and treated as failed', () => {
    const failed = installOutcome(result({ exitCode: null, timedOut: true }));
    expect(failed).toMatchObject({ state: 'failed', cause: 'timed-out' });
    expect(failed.state === 'failed' && failed.message).toContain('60 seconds');
  });

  test('a package manager that did not start, and an abort, are failures with their own cause', () => {
    expect(
      installOutcome(result({ exitCode: null, startError: 'spawn bun ENOENT' })),
    ).toMatchObject({
      cause: 'did-not-start',
    });
    expect(installOutcome(result({ exitCode: null }))).toMatchObject({ cause: 'aborted' });
  });

  test('a failed install leaves a plugin that loads, and the next look at the copy shows the not-installed note', () => {
    const outcome = installOutcome(result({ exitCode: 1 }));
    expect(outcome.state).toBe('failed');
    expect(nodeDepsNote(copy({ hasNodeModules: false }), plan(), ID)?.kind).toBe('not-installed');
  });
});

describe('judgments: the wording of the failure', () => {
  test('only the last lines of a long output are kept', () => {
    const output = Array.from({ length: 100 }, (_, index) => `line ${index}`).join('\n');
    const failed = installOutcome(result({ exitCode: 1, stdout: output }));
    expect(failed.state === 'failed' && failed.message).toContain('line 99');
    expect(failed.state === 'failed' && failed.message).not.toContain('line 10\n');
  });
});
