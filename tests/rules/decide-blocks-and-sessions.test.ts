/**
 * permission-modes.md § Protected paths (`--restricted`, settings files under the write block, the
 * symlinked settings file, `dev-mods`); settings-reference.md § `permissions.blockReadsOutsideWorkingDirectories`
 * and § What the write block refuses and what stays writable. Asserted through `decide()`.
 */
import { describe, expect, test } from 'bun:test';
import { PERMISSION_MODES } from '../../src/protocol/permission-modes.ts';
import { decide, type PreparedCall } from '../../src/rules/index.ts';
import {
  allow,
  ask,
  baseContext,
  bash,
  classify,
  deny,
  onPath,
  pathsWith,
  rulesOf,
} from '../support/decide.ts';
import { spec } from '../support/spec.ts';

const AUTO = { autoAvailable: true };
const READS = { blockReadsOutsideWorkingDirectories: true };
const WRITES = { blockWritesOutsideWorkingDirectories: true };
const GIT_CONFIG = '/work/app/.git/config';

const run = (path: string, overrides = {}) =>
  onPath('bypassPermissions', 'Write', path, { ...WRITES, ...overrides });

const read = (path: string, overrides = {}) =>
  onPath('bypassPermissions', 'Read', path, { ...READS, ...overrides });

spec('permissions.mode.auto', () => {
  describe('"In a session started with `--restricted`": the classifier cannot approve protected-path writes', () => {
    test('auto asks instead of classifying', () => {
      const protectedPaths = { restricted: true };
      expect(onPath('auto', 'Write', GIT_CONFIG, { protectedPaths })).toEqual(
        ask('protected-path'),
      );
      expect(onPath('auto', 'Write', GIT_CONFIG)).toEqual(classify('protected-path'));
    });

    test('so does plan mode where it would have classified', () => {
      const protectedPaths = { restricted: true };
      expect(onPath('plan', 'Write', GIT_CONFIG, { ...AUTO, protectedPaths })).toEqual(
        ask('protected-path'),
      );
      expect(onPath('plan', 'Write', GIT_CONFIG, AUTO)).toEqual(classify('protected-path'));
    });
  });

  describe('"The file that your settings file points to when the settings file is itself a symbolic link"', () => {
    const target = '/home/alice/dotfiles/claude/settings.json';
    const protectedPaths = { symlinkTargets: [target] };
    const match = pathsWith({ additionalDirectories: ['/home/alice/dotfiles'] });

    test('in a mode that routes protected-path writes to the classifier, a write prompts', () => {
      expect(onPath('auto', 'Write', target, { protectedPaths, match })).toEqual(
        ask('protected-path'),
      );
      expect(onPath('plan', 'Write', target, { ...AUTO, protectedPaths, match })).toEqual(
        ask('protected-path'),
      );
    });

    test('even when an allow rule matches', () => {
      const rules = rulesOf(['allow', 'Write']);
      expect(onPath('auto', 'Write', target, { protectedPaths, match, rules })).toEqual(
        ask('protected-path'),
      );
    });

    test('a file passed to --settings goes to the classifier as other protected writes do', () => {
      expect(
        onPath('auto', 'Write', target, { protectedPaths: { files: [target] }, match }),
      ).toEqual(classify('protected-path'));
    });

    test('if the target is also the path of a settings file, it goes to the classifier', () => {
      const own = '/work/other/.claude/settings.json';
      expect(
        onPath('auto', 'Write', own, {
          protectedPaths: { symlinkTargets: [own] },
          match: pathsWith({ additionalDirectories: ['/work/other'] }),
        }),
      ).toEqual(classify('protected-path'));
    });

    test('a shell command that writes it prompts the same way', () => {
      expect(
        bash('auto', `touch ${target}`, { protectedPaths, match, autoAvailable: true }),
      ).toEqual(ask('protected-path'));
    });
  });
});

for (const mode of PERMISSION_MODES) {
  spec(`permissions.mode.${mode}`, () => {
    describe(`settings files under blockWritesOutsideWorkingDirectories in ${mode} mode`, () => {
      test('are refused inside the working directories too', () => {
        for (const file of [
          '/work/app/.claude/settings.json',
          '/work/app/.claude/settings.local.json',
        ]) {
          expect(onPath(mode, 'Edit', file, { ...WRITES, ...AUTO })).toEqual(deny('settings-file'));
        }
      });

      test('a file next to one is not a settings file', () => {
        expect(
          onPath(mode, 'Edit', '/work/app/src/settings.json', { ...WRITES, ...AUTO }),
        ).not.toEqual(deny('settings-file'));
      });
    });
  });
}

spec('permissions.mode.bypassPermissions', () => {
  spec(
    ['permissions.behavior.Block file-tool reads and writes outside the working directories'],
    () => {
      spec(['permissions.reference.What the write block refuses and what stays writable'], () => {
        describe('"What the write block refuses and what stays writable"', () => {
          test('plan files, a background session`s tmp directory and the auto memory`s Markdown stay writable', () => {
            expect(run('/home/alice/.claude/plans/p.md')).toEqual(allow('mode-bypass'));
            expect(run('/home/alice/.claude/jobs/abc/tmp/x.txt')).toEqual(allow('mode-bypass'));
            expect(run('/home/alice/.claude/projects/app/memory/notes.md')).toEqual(
              allow('mode-bypass'),
            );
          });

          test('the scratchpad the host names stays writable', () => {
            expect(run('/tmp/scratch/a.txt', { sessionDirectories: ['/tmp/scratch'] })).toEqual(
              allow('mode-bypass'),
            );
            expect(run('/tmp/other/a.txt', { sessionDirectories: ['/tmp/scratch'] })).toEqual(
              deny('outside-working-directory'),
            );
          });

          test('other files outside the working directories are refused, memory data included', () => {
            expect(run('/home/alice/notes.txt')).toEqual(deny('outside-working-directory'));
            expect(run('/home/alice/.claude/projects/app/memory/data.json')).toEqual(
              deny('outside-working-directory'),
            );
            expect(run('/home/alice/.claude/settings.json')).toEqual(deny('settings-file'));
          });
        });
      });
    },
  );

  spec(
    ['permissions.behavior.Block file-tool reads and writes outside the working directories'],
    () => {
      describe('"Files Claude Code itself needs stay readable" under blockReadsOutsideWorkingDirectories', () => {
        test('skills, plugins, rules, agents, commands and CLAUDE.md under ~/.claude', () => {
          for (const path of [
            '/home/alice/.claude/skills/x/SKILL.md',
            '/home/alice/.claude/plugins/p/plugin.json',
            '/home/alice/.claude/rules/r.md',
            '/home/alice/.claude/agents/a.md',
            '/home/alice/.claude/commands/c.md',
            '/home/alice/.claude/CLAUDE.md',
          ]) {
            expect(read(path)).toEqual(allow('mode-bypass'));
          }
        });

        test('other files there and elsewhere are refused', () => {
          expect(read('/home/alice/.claude/history.jsonl')).toEqual(
            deny('outside-working-directory'),
          );
          expect(read('/etc/hosts')).toEqual(deny('outside-working-directory'));
        });

        test('a symlink that leads out of the working directory is judged by where it leads', () => {
          const call: PreparedCall = {
            toolName: 'Read',
            input: { file_path: '/work/app/link' },
            resolvedPaths: ['/etc/hosts'],
          };
          expect(decide(call, baseContext('bypassPermissions', READS))).toEqual(
            deny('outside-working-directory'),
          );
        });
      });
    },
  );

  describe('"Protected files" and "Protected directories": `dev-mods` and CLAUDE_CONFIG_DIR', () => {
    test('~/.claude/dev-mods and the same folder of CLAUDE_CONFIG_DIR are protected', () => {
      const protectedPaths = { configDirectory: '/home/alice/cfg' };
      const options = {
        protectedPaths,
        match: pathsWith({ additionalDirectories: ['/home/alice'] }),
      };
      expect(onPath('default', 'Write', '/home/alice/cfg/dev-mods/m.js', options)).toEqual(
        ask('protected-path'),
      );
      expect(onPath('default', 'Write', '/home/alice/.claude/dev-mods/m.js', options)).toEqual(
        ask('protected-path'),
      );
    });

    test('the plan files of the configuration directory stay an exception', () => {
      const options = {
        protectedPaths: { configDirectory: '/home/alice/.claude-work' },
        match: pathsWith({ additionalDirectories: ['/home/alice'] }),
      };
      expect(onPath('default', 'Write', '/home/alice/.claude-work/plans/p.md', options)).toEqual(
        ask('default-prompt'),
      );
    });
  });
});
