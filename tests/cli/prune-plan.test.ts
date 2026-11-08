/**
 * plugins/cli-reference.md § plugin prune: "Remove auto-installed dependencies that no installed
 * plugin needs anymore. The command never removes a plugin you installed yourself"; `-s, --scope`
 * "Defaults to `user`"; `--dry-run` "Claude Code lists the orphaned dependencies and ends with `(dry
 * run — nothing removed)`. With none to remove, it prints a line that starts `Nothing to prune`";
 * "Without `--dry-run`, the command removes the orphaned dependencies only after you confirm at the
 * prompt or pass `-y`. The exit code is `0` whatever you answer at the prompt"; the table of terminal
 * and flags (`Remove? [y/N]`, `Removed N auto-installed plugins: <names>`, ``Not a TTY — run `claude
 * plugin prune -y` to remove.``). That a refusal without a TTY exits `0` is read from "The exit code
 * is `0` whatever you answer" (spec/judgments.md).
 */
import { describe, expect, test } from 'bun:test';
import {
  answerPrune,
  planPruneCommand,
  type PruneArguments,
  type PrunePlan,
} from '../../src/cli/prune-plan.ts';
import { renderCommand } from '../../src/cli/result.ts';
import { facts, installed } from '../support/dependency-facts.ts';
import { spec } from '../support/spec.ts';

const graph = facts(
  [],
  [
    installed('app@m', { deps: ['lib'] }),
    installed('lib@m', { auto: true }),
    installed('gone-dep@m', { auto: true }),
    installed('mine@m'),
  ],
);

const run = (args: PruneArguments = {}, tty = true, world = graph): PrunePlan =>
  planPruneCommand(args, { graph: world, tty });

const out = (plan: PrunePlan) => renderCommand(plan.output, { json: false });

const ORPHANS = ['gone-dep@m'];

spec('cli.plugin.plugin prune.--dry-run', () => {
  test('lists the orphaned dependencies and ends with (dry run — nothing removed)', () => {
    const plan = run({ dryRun: true });
    const text = out(plan).stdout.join('\n');
    expect(text).toContain('gone-dep@m');
    expect(text.endsWith('(dry run — nothing removed)')).toBe(true);
    expect(plan.remove).toEqual([]);
  });

  test('removes nothing even with -y, and with none to remove prints a line that starts Nothing to prune', () => {
    expect(run({ dryRun: true, yes: true }).remove).toEqual([]);
    const clean = facts([], [installed('mine@m')]);
    expect(out(run({ dryRun: true }, true, clean)).stdout[0]).toStartWith('Nothing to prune');
  });
});

spec('cli.plugin.plugin prune.-s, --scope <scope>', () => {
  const world = facts(
    [],
    [
      installed('lib@m', { auto: true, scope: 'project' }),
      installed('lib2@m', { auto: true, scope: 'user' }),
    ],
  );

  test('defaults to user', () => {
    expect(run({ yes: true }, true, world)).toMatchObject({ scope: 'user', remove: ['lib2@m'] });
  });

  test('prunes at the scope it names', () => {
    expect(run({ scope: 'project', yes: true }, true, world)).toMatchObject({
      scope: 'project',
      remove: ['lib@m'],
    });
  });

  test('a scope outside user, project and local is a usage error', () => {
    expect(run({ scope: 'managed' }).output).toMatchObject({ kind: 'usage-error' });
  });
});

spec('cli.plugin.plugin prune.-y', () => {
  test('removes the orphans without asking, whatever the terminal', () => {
    for (const tty of [true, false]) {
      const plan = run({ yes: true }, tty);
      expect(plan.remove).toEqual(ORPHANS);
      expect(plan.ask).toBeUndefined();
    }
  });
});

spec('cli.plugin.plugin prune.-y, --yes', () => {
  test('prints Removed N auto-installed plugins: <names> and exits 0', () => {
    expect(out(run({ yes: true }))).toEqual({
      stdout: ['Removed 1 auto-installed plugins: gone-dep@m'],
      stderr: [],
      exitCode: 0,
    });
  });

  test('without a terminal and without -y it prints the list and the Not a TTY line, removes nothing and exits 0', () => {
    const plan = run({}, false);
    expect(plan.remove).toEqual([]);
    const found = out(plan);
    expect(found.exitCode).toBe(0);
    expect(found.stdout.join('\n')).toBe(
      'gone-dep@m\nNot a TTY — run `claude plugin prune -y` to remove.',
    );
  });

  test('an interactive terminal without -y lists them and asks Remove? [y/N]', () => {
    const plan = run({}, true);
    expect(plan.remove).toEqual([]);
    expect(plan.ask).toEqual({ prompt: 'Remove? [y/N]', orphans: ORPHANS });
    expect(out(plan).stdout.join('\n')).toBe('gone-dep@m\nRemove? [y/N]');
  });
});

describe('the answer at the prompt', () => {
  test('yes removes them; no removes nothing; the exit code is 0 either way', () => {
    const plan = run({}, true);
    const yes = answerPrune(plan, true);
    expect(yes.remove).toEqual(ORPHANS);
    expect(renderCommand(yes.output, { json: false })).toMatchObject({ exitCode: 0 });
    const no = answerPrune(plan, false);
    expect(no.remove).toEqual([]);
    expect(renderCommand(no.output, { json: false }).exitCode).toBe(0);
  });

  test('answering a plan that asked nothing changes nothing', () => {
    const plan = run({ yes: true });
    expect(answerPrune(plan, false)).toBe(plan);
  });
});

describe('what prune never removes', () => {
  test('a plugin the user installed, and a dependency an installed plugin still needs', () => {
    const plan = run({ yes: true });
    expect(plan.remove).not.toContain('mine@m');
    expect(plan.remove).not.toContain('lib@m');
  });
});
