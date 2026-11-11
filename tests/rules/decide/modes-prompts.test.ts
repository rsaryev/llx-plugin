/**
 * permission-modes.md § "Allow only pre-approved tools with dontAsk mode" (what runs, what is
 * denied, what "An allow rule or `PreToolUse` hook can't approve"), § "Actions no mode
 * auto-approves" (each bullet, in every mode; "Allow rules have no effect in `bypassPermissions`"),
 * § "Skip all checks with bypassPermissions mode" (everything runs but those; plan mode's blocks
 * are not enforced at a terminal) and § "Tool calls denied in `claude -p` and Agent SDK runs";
 * permissions.md § "Permission modes" (the `dontAsk` and `bypassPermissions` rows), § "Precedence
 * among rules, hooks, and mods". Asserted through `decide()`.
 */
import { describe, expect, test } from 'bun:test';
import { allow, ask, bash, decision, deny, onPath, rulesOf } from '../../support/decide.ts';
import { spec } from '../../support/spec.ts';

const MODES_THAT_PROMPT = ['default', 'acceptEdits', 'plan', 'auto', 'bypassPermissions'] as const;
const AUTO = { autoAvailable: true };

spec('permissions.modes.Allow only pre-approved tools with dontAsk mode', () => {
  test('every call that would prompt is denied: a command, an edit, a fetch, a read outside the directories', () => {
    expect(bash('dontAsk', 'npm test')).toEqual(deny('mode-dontask'));
    expect(onPath('dontAsk', 'Edit', '/work/app/a.ts')).toEqual(deny('mode-dontask'));
    expect(decision('dontAsk', 'WebFetch', { url: 'https://example.com', prompt: 'p' })).toEqual(
      deny('mode-dontask'),
    );
    expect(onPath('dontAsk', 'Read', '/etc/hosts')).toEqual(deny('mode-dontask'));
  });

  test('actions that need no approval in Manual mode still run: reads in the working directories, read-only Bash', () => {
    expect(onPath('dontAsk', 'Read', '/work/app/a.ts')).toEqual(allow('read-in-working-directory'));
    expect(bash('dontAsk', 'git status')).toEqual(allow('read-only-command'));
  });

  test('calls matching permissions.allow rules run: the CI example allows "Bash(npm test)" and "Read"', () => {
    const rules = rulesOf(['allow', 'Bash(npm test)'], ['allow', 'Read']);
    expect(bash('dontAsk', 'npm test', { rules })).toEqual(allow('allow-rule'));
    expect(bash('dontAsk', 'npm run build', { rules })).toEqual(deny('mode-dontask'));
    expect(onPath('dontAsk', 'Read', '/etc/hosts', { rules })).toEqual(allow('allow-rule'));
  });

  test('calls a PreToolUse hook approves run too', () => {
    expect(bash('dontAsk', 'npm test', { hook: { decision: 'allow' } })).toEqual(allow('hook'));
  });

  test('a mod you installed can still approve a call that nothing but the mode would deny', () => {
    const mod = { approved: true, policyEnforced: true };
    expect(bash('dontAsk', 'npm test', { mod })).toEqual(allow('mod'));
  });

  test('explicit ask rules are denied rather than prompted', () => {
    expect(
      bash('dontAsk', 'git push origin main', { rules: rulesOf(['ask', 'Bash(git push *)']) }),
    ).toEqual(deny('ask-rule'));
  });

  test('AskUserQuestion is denied even if an allow rule matches it; so are MCP tools marked requiresUserInteraction and connector tools set to ask', () => {
    const rules = rulesOf(
      ['allow', 'AskUserQuestion'],
      ['allow', 'mcp__forms__confirm'],
      ['allow', 'mcp__crm__lookup'],
    );
    expect(decision('dontAsk', 'AskUserQuestion', { questions: [] }, { rules })).toEqual(
      deny('requires-user-interaction'),
    );
    const forms = new Set(['mcp__forms__confirm']);
    expect(
      decision('dontAsk', 'mcp__forms__confirm', {}, { rules, requiresUserInteraction: forms }),
    ).toEqual(deny('requires-user-interaction'));
    const connectors = new Set(['mcp__crm__lookup']);
    expect(
      decision('dontAsk', 'mcp__crm__lookup', {}, { rules, connectorToolsSetToAsk: connectors }),
    ).toEqual(deny('organization-ask'));
  });

  spec(
    [
      'permissions.behavior.Network paths.Allow rules',
      'permissions.behavior.Network paths.PreToolUse hooks',
    ],
    () => {
      test('an allow rule or a PreToolUse hook cannot approve a critical-path removal or a read from a network path', () => {
        const rules = rulesOf(['allow', 'Bash'], ['allow', 'Read']);
        const hook = { decision: 'allow' as const };
        expect(bash('dontAsk', 'rm -rf ~', { rules, hook })).toEqual(deny('critical-path'));
        expect(onPath('dontAsk', 'Read', '/net/fileserver/notes.txt', { rules, hook })).toEqual(
          deny('network-path'),
        );
      });
    },
  );

  test('a deny rule still denies', () => {
    expect(
      bash('dontAsk', 'rm x', { rules: rulesOf(['deny', 'Bash(rm *)'], ['allow', 'Bash(rm *)']) }),
    ).toEqual(deny('deny-rule'));
  });
});

describe('Actions no mode auto-approves', () => {
  spec('permissions.modes.Actions no mode auto-approves', () => {
    for (const mode of MODES_THAT_PROMPT) {
      describe(`in ${mode} mode`, () => {
        test('a tool matched by an explicit ask rule prompts, whatever an allow rule or hook says', () => {
          const rules = rulesOf(['ask', 'Bash(git push *)'], ['allow', 'Bash(git push *)']);
          expect(
            bash(mode, 'git push origin main', { ...AUTO, rules, hook: { decision: 'allow' } }),
          ).toEqual(ask('ask-rule'));
        });

        test('a connector tool the organization set to ask prompts, even when allowed by a rule, a hook or a mod', () => {
          const overrides = {
            ...AUTO,
            rules: rulesOf(['allow', 'mcp__crm__lookup']),
            hook: { decision: 'allow' as const },
            mod: { approved: true, policyEnforced: false },
            connectorToolsSetToAsk: new Set(['mcp__crm__lookup']),
          };
          expect(decision(mode, 'mcp__crm__lookup', {}, overrides)).toEqual(
            ask('organization-ask'),
          );
        });

        test('AskUserQuestion and an MCP tool marked requiresUserInteraction prompt', () => {
          expect(decision(mode, 'AskUserQuestion', { questions: [] }, AUTO)).toEqual(
            ask('requires-user-interaction'),
          );
          const marked = new Set(['mcp__forms__confirm']);
          expect(
            decision(mode, 'mcp__forms__confirm', {}, { ...AUTO, requiresUserInteraction: marked }),
          ).toEqual(ask('requires-user-interaction'));
        });

        test('a recognized rm or rmdir critical-path removal prompts, which no allow rule or PreToolUse hook allow approves', () => {
          const rules = rulesOf(['allow', 'Bash(rm *)']);
          const decided = bash(mode, 'rm -rf /', {
            ...AUTO,
            rules,
            hook: { decision: 'allow' },
            interactive: true,
          });
          expect(decided.outcome).toBe('ask');
          expect(decided.reason).toBe('critical-path');
        });

        test('with the read block on, a file-reading Bash command that names a path outside the directories prompts', () => {
          const decided = bash(mode, 'cat /etc/passwd', {
            ...AUTO,
            blockReadsOutsideWorkingDirectories: true,
          });
          expect(decided).toEqual(ask('outside-working-directory'));
        });

        test('with the read block on, a command the shell parser cannot trace prompts even when it names no outside path', () => {
          const decided = bash(mode, 'cd a && cd b && ls', {
            ...AUTO,
            blockReadsOutsideWorkingDirectories: true,
          });
          expect(decided).toEqual(ask('outside-working-directory'));
        });

        test('a command that runs unsandboxed, where the sandbox does not enforce the block, prompts too', () => {
          const decided = bash(mode, 'cat /etc/passwd', {
            ...AUTO,
            blockReadsOutsideWorkingDirectories: true,
            sandboxEnforcesReadBlock: false,
          });
          expect(decided).toEqual(ask('outside-working-directory'));
        });

        test('with the write block on, Write, Edit and NotebookEdit outside the working directories are refused', () => {
          for (const tool of ['Write', 'Edit', 'NotebookEdit'] as const) {
            const decided = onPath(mode, tool, '/etc/hosts', {
              ...AUTO,
              blockWritesOutsideWorkingDirectories: true,
            });
            expect(decided).toEqual(deny('outside-working-directory'));
          }
        });
      });
    }

    test('the sandbox that enforces the read block spares the prompt', () => {
      const overrides = {
        blockReadsOutsideWorkingDirectories: true,
        sandboxEnforcesReadBlock: true,
      };
      expect(bash('bypassPermissions', 'cat /etc/passwd', overrides).outcome).toBe('allow');
    });

    test('the write block does not limit shell commands or MCP tools', () => {
      const overrides = { blockWritesOutsideWorkingDirectories: true };
      expect(bash('bypassPermissions', 'tee /etc/motd', overrides)).toEqual(allow('mode-bypass'));
      expect(decision('bypassPermissions', 'mcp__files__write', {}, overrides)).toEqual(
        allow('mode-bypass'),
      );
    });

    test('dontAsk denies those same calls instead of prompting', () => {
      const rules = rulesOf(['ask', 'Bash(git push *)']);
      expect(bash('dontAsk', 'git push origin main', { rules })).toEqual(deny('ask-rule'));
      expect(decision('dontAsk', 'AskUserQuestion', { questions: [] })).toEqual(
        deny('requires-user-interaction'),
      );
      expect(bash('dontAsk', 'rm -rf /')).toEqual(deny('critical-path'));
    });

    test('bypassPermissions lets dangerous rm through only when the prompt is turned off', () => {
      expect(bash('bypassPermissions', 'rm -rf /')).toEqual(ask('critical-path'));
      expect(bash('bypassPermissions', 'rm -rf /', { criticalPathPromptOff: true })).toEqual(
        allow('mode-bypass'),
      );
    });
  });
});
