/**
 * permission-modes.md § Eliminate permission prompts with auto mode, § How the classifier evaluates
 * actions ("Each action goes through a fixed decision order. The first matching step wins"),
 * § When auto mode falls back; permissions.md § Precedence among rules, hooks, and mods and
 * § Network paths.
 *
 * What is proved here is the routing policy and nothing else: which calls the kit resolves itself
 * (rules, reads, edits in the working directory) and which it hands to the classifier. The
 * classifier is a server-side model review (its alignment judgement of an action against the user's
 * request); the kit holds no model and no classifier, so that judgement is host-side. The
 * `PermissionClassifier` port carries the call to the host's reviewer, and `settleClassification`
 * maps the reviewer's answer; both are tested here with a fake reviewer.
 */
import { describe, expect, test } from 'bun:test';
import {
  decide,
  settleClassification,
  type PermissionClassifier,
  type PreparedCall,
} from '../../src/rules/index.ts';
import {
  allow,
  ask,
  baseContext,
  bash,
  classify,
  decision,
  deny,
  onPath,
  rulesOf,
} from '../support/decide.ts';
import { spec } from '../support/spec.ts';

const AUTO = { autoAvailable: true };

/** `decide` in auto mode on a call a host already prepared. */
const decisionOf = (call: PreparedCall) => decide(call, baseContext('auto', AUTO));

/** `rule` written as an allow rule: left out in auto mode, back in effect in default mode. */
const dropped = (text: string, tool: string, input: unknown): void => {
  const rules = rulesOf(['allow', text]);
  expect(decision('auto', tool, input, { ...AUTO, rules })).toEqual(classify('mode-auto'));
  expect(decision('default', tool, input, { rules })).toEqual(allow('allow-rule'));
};

/** A fake reviewer that always answers `answer`. */
const reviewer = (answer: 'allow' | 'deny' | 'ask'): PermissionClassifier => ({
  review: () => Promise.resolve(answer),
});

spec('permissions.mode.auto', () => {
  describe('decision order step 2: reads and file edits in the working directory resolve without the classifier', () => {
    test('read-only actions are approved', () => {
      expect(onPath('auto', 'Read', '/work/app/a.ts', AUTO)).toEqual(
        allow('read-in-working-directory'),
      );
      expect(bash('auto', 'ls', AUTO)).toEqual(allow('read-only-command'));
    });

    test('a read outside the working directories also runs, apart from network paths', () => {
      expect(onPath('auto', 'Read', '/etc/hosts', AUTO)).toEqual(allow('mode-auto'));
    });

    test('file edits in the working directory are approved', () => {
      expect(onPath('auto', 'Edit', '/work/app/src/a.ts', AUTO)).toEqual(allow('mode-auto'));
      expect(onPath('auto', 'Write', '/work/app/new.ts', AUTO)).toEqual(allow('mode-auto'));
    });

    test('a write the symlink check resolves outside the working directory prompts', () => {
      const prepared: PreparedCall = {
        toolName: 'Write',
        input: { file_path: '/work/app/link/a.ts' },
        resolvedPaths: ['/etc/cron.d/a'],
      };
      expect(decisionOf(prepared)).toEqual(ask('default-prompt'));
    });
  });

  describe('decision order step 3: everything else goes to the classifier', () => {
    test('a shell command goes to the classifier', () => {
      expect(bash('auto', 'npm test', AUTO)).toEqual(classify('mode-auto'));
      expect(bash('auto', 'curl https://example.com', AUTO)).toEqual(classify('mode-auto'));
    });

    test('so do network requests, web fetches and an edit outside the working directories', () => {
      expect(
        decision('auto', 'WebFetch', { url: 'https://example.com', prompt: 'x' }, AUTO),
      ).toEqual(classify('mode-auto'));
      expect(onPath('auto', 'Edit', '/work/other/a.ts', AUTO)).toEqual(classify('mode-auto'));
    });
  });

  describe('decision order step 1: rules resolve immediately, with exceptions', () => {
    test('a deny rule denies and an allow rule approves', () => {
      expect(bash('auto', 'rm x', { ...AUTO, rules: rulesOf(['deny', 'Bash(rm *)']) })).toEqual(
        deny('deny-rule'),
      );
      expect(
        bash('auto', 'npm test', { ...AUTO, rules: rulesOf(['allow', 'Bash(npm test)']) }),
      ).toEqual(allow('allow-rule'));
    });

    test('an ask rule prompts, also for a command nested in a compound command, even in auto mode', () => {
      const rules = rulesOf(['ask', 'Bash(git clean *)']);
      expect(bash('auto', 'cd /tmp && git clean -f', { ...AUTO, rules })).toEqual(ask('ask-rule'));
      expect(bash('auto', 'echo "$(git clean -f)"', { ...AUTO, rules })).toEqual(ask('ask-rule'));
    });

    test('writes to protected paths route to the classifier even when an allow rule matches', () => {
      const rules = rulesOf(['allow', 'Edit(.git/**)']);
      expect(onPath('auto', 'Write', '/work/app/.git/config', { ...AUTO, rules })).toEqual(
        classify('protected-path'),
      );
    });

    test('a write that resolves to a protected path prompts when the requested path is not protected', () => {
      const prepared: PreparedCall = {
        toolName: 'Write',
        input: { file_path: '/work/app/notes.txt' },
        resolvedPaths: ['/work/app/.git/config'],
      };
      expect(decisionOf(prepared)).toEqual(ask('protected-path'));
    });

    test('no allow rule approves a recognized critical-path removal: it asks at a terminal, elsewhere denies', () => {
      const rules = rulesOf(['allow', 'Bash(rm *)']);
      expect(bash('auto', 'rm -rf ~', { ...AUTO, rules })).toEqual(ask('critical-path'));
      expect(bash('auto', 'rm -rf ~', { ...AUTO, rules, interactive: false })).toEqual(
        deny('critical-path'),
      );
    });

    test('an explicit ask rule on a critical-path removal asks even away from a terminal', () => {
      const rules = rulesOf(['ask', 'Bash(rm *)']);
      expect(bash('auto', 'rm -rf ~', { ...AUTO, rules, interactive: false })).toEqual(
        ask('ask-rule'),
      );
    });

    test('an MCP tool marked requiresUserInteraction prompts even when an allow rule matches', () => {
      expect(
        decision(
          'auto',
          'mcp__forms__confirm',
          {},
          {
            ...AUTO,
            rules: rulesOf(['allow', 'mcp__forms__confirm']),
            requiresUserInteraction: new Set(['mcp__forms__confirm']),
          },
        ),
      ).toEqual(ask('requires-user-interaction'));
    });

    test('a read from a network path prompts even when an allow rule matches and the classifier is not asked', () => {
      const rules = rulesOf(['allow', 'Read']);
      expect(onPath('auto', 'Read', '/net/fileserver/notes.txt', { ...AUTO, rules })).toEqual(
        ask('network-path'),
      );
    });
  });

  describe('on entering auto mode, broad allow rules that grant arbitrary code execution are dropped', () => {
    test('a blanket Bash(*) or PowerShell(*)', () => {
      dropped('Bash(*)', 'Bash', { command: 'npm test' });
      dropped('Bash', 'Bash', { command: 'npm test' });
      dropped('PowerShell(*)', 'PowerShell', { command: 'Invoke-WebRequest https://example.com' });
    });

    test('a wildcarded interpreter', () => {
      dropped('Bash(python*)', 'Bash', { command: 'python script.py' });
    });

    test('package-manager run commands', () => {
      dropped('Bash(npm run *)', 'Bash', { command: 'npm run build' });
      dropped('Bash(pnpm run *)', 'Bash', { command: 'pnpm run build' });
    });

    test('Agent and Monitor allow rules', () => {
      dropped('Agent', 'Agent', { prompt: 'x', description: 'y', subagent_type: 'Explore' });
      dropped('Monitor', 'Monitor', { command: 'tail -f log' });
    });

    test('narrow rules like Bash(npm test) stay in effect', () => {
      const rules = rulesOf(['allow', 'Bash(npm test)']);
      expect(bash('auto', 'npm test', { ...AUTO, rules })).toEqual(allow('allow-rule'));
    });
  });

  describe('a mod that approves in auto mode', () => {
    const mod = { approved: true, policyEnforced: false };

    test('runs without a classifier check', () => {
      expect(bash('auto', 'npm test', { ...AUTO, mod })).toEqual(allow('mod'));
    });

    test('a mod that policy does not enforce reaches past a permission callback', () => {
      expect(bash('auto', 'npm test', { ...AUTO, mod, permissionCallback: true })).toEqual(
        allow('mod'),
      );
    });

    test('except where it cannot bypass the permission prompt tool or SDK callback: the classifier checks first', () => {
      expect(
        bash('auto', 'npm test', {
          ...AUTO,
          mod: { approved: true, policyEnforced: true },
          permissionCallback: true,
        }),
      ).toEqual(classify('mode-auto'));
    });
  });
});

describe('the PermissionClassifier port (the host reviews, the kit maps the answer)', () => {
  const call: PreparedCall = { toolName: 'Bash', input: { command: 'npm test' } };

  test('a fake reviewer is handed the call and the mode, and its answer settles the decision', async () => {
    const seen: unknown[] = [];
    const classifier: PermissionClassifier = {
      review: (reviewed, context) => {
        seen.push([reviewed.toolName, context.mode]);
        return Promise.resolve('allow');
      },
    };
    const settled = await settleClassification(classify('mode-auto'), {
      call,
      mode: 'auto',
      classifier,
    });
    expect(settled).toEqual(allow('mode-auto'));
    expect(seen).toEqual([['Bash', 'auto']]);
  });

  test('deny and ask map to a denial and a prompt', async () => {
    expect(
      await settleClassification(classify('mode-auto'), {
        call,
        mode: 'auto',
        classifier: reviewer('deny'),
      }),
    ).toEqual(deny('mode-auto'));
    expect(
      await settleClassification(classify('mode-auto'), {
        call,
        mode: 'auto',
        classifier: reviewer('ask'),
      }),
    ).toEqual(ask('mode-auto'));
  });

  test('a decision the kit already made is not sent to the reviewer', async () => {
    const never: PermissionClassifier = {
      review: () => Promise.reject(new Error('the reviewer must not be asked')),
    };
    expect(
      await settleClassification(allow('allow-rule'), { call, mode: 'auto', classifier: never }),
    ).toEqual(allow('allow-rule'));
    expect(
      await settleClassification(deny('deny-rule'), { call, mode: 'auto', classifier: never }),
    ).toEqual(deny('deny-rule'));
  });

  test('with no reviewer there is no verdict, and no verdict denies the action rather than run it unreviewed', async () => {
    expect(await settleClassification(classify('mode-auto'), { call, mode: 'auto' })).toEqual(
      deny('mode-auto'),
    );
  });
});
