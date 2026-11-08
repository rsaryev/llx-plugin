/**
 * plugins/troubleshooting.md § A plugin installed from a git repository shows version `unknown`:
 * the four steps and the per-scope rerun. The commands are quoted from the section with its example
 * ids; the surrounding wording and the choice to skip a scope the user cannot write are judgments
 * (spec/judgments.md).
 */
import { expect, test } from 'bun:test';
import { unknownVersionSteps } from '../../src/marketplace/version-troubleshooting.ts';
import { spec } from '../support/spec.ts';

spec(
  'install.troubleshooting.A plugin installed from a git repository shows version unknown',
  () => {
    const plan = unknownVersionSteps('formatter@my-marketplace', ['user']);

    test('step 1 updates Claude Code to v2.1.302 or later, which reads the commit', () => {
      expect(plan.steps[0]).toEqual({ command: 'claude update', minimumClaudeCode: '2.1.302' });
    });

    test("step 2 updates the plugin's marketplace", () => {
      expect(plan.steps[1]?.command).toBe('claude plugin marketplace update my-marketplace');
    });

    test('step 3 updates the plugin to rewrite its recorded version', () => {
      expect(plan.steps[2]?.command).toBe('claude plugin update formatter@my-marketplace');
    });

    test('step 4 checks the Version: line of claude plugin list', () => {
      expect(plan.steps[3]?.command).toBe('claude plugin list');
      expect(plan.steps).toHaveLength(4);
    });

    test('a block still showing unknown is updated again with its own scope', () => {
      const rerun = unknownVersionSteps('formatter@my-marketplace', ['user', 'project']).rerun;
      expect(rerun).toEqual([
        { scope: 'user', command: 'claude plugin update formatter@my-marketplace --scope user' },
        {
          scope: 'project',
          command: 'claude plugin update formatter@my-marketplace --scope project',
        },
      ]);
    });

    test('judgment: no rerun is offered for the managed scope, which the user cannot change', () => {
      expect(
        unknownVersionSteps('formatter@m', ['managed', 'local']).rerun.map((one) => one.scope),
      ).toEqual(['local']);
    });

    test('the marketplace is what follows the last @ of the id', () => {
      expect(unknownVersionSteps('a@b@c', []).steps[1]?.command).toBe(
        'claude plugin marketplace update c',
      );
    });
  },
);
