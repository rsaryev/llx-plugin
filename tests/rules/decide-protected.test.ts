/**
 * permission-modes.md § Protected paths (the per-mode table, "Protected directories" and
 * "Protected files"); permissions.md § Network paths. Whether a write to a protected path or a read
 * from a network path is approved, prompted, classified or denied in each mode, asserted through
 * `decide()`. The expectation lists below are copied by hand from the docs, never read back from
 * the code under test.
 */
import { describe, expect, test } from 'bun:test';
import { PERMISSION_MODES } from '../../src/protocol/permission-modes.ts';
import type { PermissionMode } from '../../src/protocol/official.ts';
import { decide } from '../../src/rules/index.ts';
import {
  allow,
  ask,
  baseContext,
  classify,
  decision,
  deny,
  onPath,
  pathsWith,
  rulesOf,
} from '../support/decide.ts';
import { spec } from '../support/spec.ts';

const PROTECTED_DIRECTORIES: readonly string[] = [
  '.git',
  '.config/git',
  '.vscode',
  '.idea',
  '.husky',
  '.cargo',
  '.devcontainer',
  '.yarn',
  '.mvn',
  '.claude',
];

const PROTECTED_FILES: readonly string[] = [
  '.gitconfig',
  '.gitmodules',
  '.bashrc',
  '.bash_profile',
  '.bash_login',
  '.bash_aliases',
  '.bash_logout',
  '.zshrc',
  '.zprofile',
  '.zshenv',
  '.zlogin',
  '.zlogout',
  '.profile',
  '.envrc',
  '.npmrc',
  '.yarnrc',
  '.yarnrc.yml',
  '.pnp.cjs',
  '.pnp.loader.mjs',
  '.pnpmfile.cjs',
  'bunfig.toml',
  '.bunfig.toml',
  '.bazelrc',
  '.bazelversion',
  '.bazeliskrc',
  '.pre-commit-config.yaml',
  'lefthook.yml',
  'lefthook.yaml',
  '.lefthook.yml',
  '.lefthook.yaml',
  'gradle-wrapper.properties',
  'maven-wrapper.properties',
  '.devcontainer.json',
  '.ripgreprc',
  'pyrightconfig.json',
  '.mcp.json',
  '.claude.json',
  'remote-settings.json',
];

/** The "Protected-path writes" column, per mode: what a write to `.git/config` gets. */
const TABLE: { readonly [M in PermissionMode]: ReturnType<typeof ask> } = {
  default: ask('protected-path'),
  acceptEdits: ask('protected-path'),
  plan: ask('protected-path'),
  auto: classify('protected-path'),
  dontAsk: deny('protected-path'),
  bypassPermissions: allow('mode-bypass'),
};

/** `decide` in default mode on a call a host already prepared. */
const decisionOf = (call: Parameters<typeof decide>[0]) => decide(call, baseContext('default'));

/** A write in acceptEdits mode where the home `.claude` folder is an additional directory. */
const accepted = (path: string, protectedPaths = {}) =>
  onPath('acceptEdits', 'Write', path, {
    protectedPaths,
    match: pathsWith({ additionalDirectories: ['/home/alice/.claude'] }),
  });

const GIT_CONFIG = '/work/app/.git/config';
for (const mode of PERMISSION_MODES) {
  spec(`permissions.mode.${mode}`, () => {
    describe(`"Protected paths" in ${mode} mode`, () => {
      test('a write to a protected directory gets the outcome of the table', () => {
        expect(onPath(mode, 'Write', GIT_CONFIG)).toEqual(TABLE[mode]);
      });

      test('an allow rule in settings does not pre-approve it', () => {
        const rules = rulesOf(['allow', 'Edit(.git/**)'], ['allow', 'Write']);
        expect(onPath(mode, 'Write', GIT_CONFIG, { rules })).toEqual(TABLE[mode]);
      });
    });
  });
}

spec('permissions.mode.default', () => {
  describe('"Protected paths": the directories and files of the docs', () => {
    for (const directory of PROTECTED_DIRECTORIES) {
      test(`a write below ${directory} in the project and in a nested folder is protected`, () => {
        expect(onPath('default', 'Write', `/work/app/${directory}/x.txt`)).toEqual(
          ask('protected-path'),
        );
        expect(onPath('default', 'Edit', `/work/app/packages/api/${directory}/x.txt`)).toEqual(
          ask('protected-path'),
        );
      });
    }

    for (const file of PROTECTED_FILES) {
      test(`${file} is protected`, () => {
        expect(onPath('default', 'Write', `/work/app/${file}`)).toEqual(ask('protected-path'));
        expect(onPath('default', 'Write', `/home/alice/${file}`)).toEqual(ask('protected-path'));
      });
    }

    test('a file near the list is not protected', () => {
      expect(onPath('default', 'Write', '/work/app/.gitignore')).toEqual(ask('default-prompt'));
      expect(onPath('default', 'Write', '/work/app/.github/workflows/ci.yml')).toEqual(
        ask('default-prompt'),
      );
      expect(onPath('default', 'Write', '/work/app/.config/other/x')).toEqual(
        ask('default-prompt'),
      );
      expect(onPath('default', 'Write', '/work/app/src/git/x')).toEqual(ask('default-prompt'));
    });

    test('a file passed to --settings, --mcp-config or --agents is protected', () => {
      expect(
        onPath('default', 'Write', '/work/app/custom.json', {
          protectedPaths: { files: ['/work/app/custom.json'] },
        }),
      ).toEqual(ask('protected-path'));
    });

    test('the file a symlinked settings file points to is protected', () => {
      expect(
        onPath('default', 'Write', '/home/alice/dotfiles/claude/settings.json', {
          protectedPaths: { symlinkTargets: ['/home/alice/dotfiles/claude/settings.json'] },
        }),
      ).toEqual(ask('protected-path'));
    });

    test('a directory loaded with --plugin-dir is protected', () => {
      expect(
        onPath('default', 'Write', '/work/plugin/hooks/run.js', {
          protectedPaths: { directories: ['/work/plugin'] },
        }),
      ).toEqual(ask('protected-path'));
    });
  });

  describe('"Protected paths": the exceptions below .claude', () => {
    test('Claude own git worktrees under .claude/worktrees/', () => {
      expect(onPath('acceptEdits', 'Write', '/work/app/.claude/worktrees/f/a.ts')).toEqual(
        allow('accept-edits'),
      );
      expect(onPath('acceptEdits', 'Write', '/work/app/.claude/settings.json')).toEqual(
        ask('protected-path'),
      );
      expect(onPath('acceptEdits', 'Write', '/work/app/.claude/commands/x.md')).toEqual(
        ask('protected-path'),
      );
    });

    test("the session's own plan files in ~/.claude/plans/, or in the plansDirectory", () => {
      expect(accepted('/home/alice/.claude/plans/plan.md')).toEqual(allow('accept-edits'));
      expect(
        onPath('acceptEdits', 'Write', '/work/app/.claude/my-plans/p.md', {
          protectedPaths: { plansDirectory: '/work/app/.claude/my-plans' },
        }),
      ).toEqual(allow('accept-edits'));
    });

    test("a background session's own scratch directory ~/.claude/jobs/<id>/tmp/", () => {
      expect(accepted('/home/alice/.claude/jobs/abc/tmp/x.txt')).toEqual(allow('accept-edits'));
      expect(accepted('/home/alice/.claude/jobs/abc/state.json')).toEqual(ask('protected-path'));
    });

    test('Markdown files in the auto memory directory, in a session started without --restricted', () => {
      const memory = '/home/alice/.claude/projects/app/memory/notes.md';
      expect(accepted(memory)).toEqual(allow('accept-edits'));
      expect(accepted('/home/alice/.claude/projects/app/memory/data.json')).toEqual(
        ask('protected-path'),
      );
      expect(accepted(memory, { restricted: true })).toEqual(ask('protected-path'));
    });

    test('Markdown files in a subagent memory directory, in a session started without --restricted', () => {
      const memory = '/work/app/.claude/agent-memory/reviewer/notes.md';
      expect(onPath('acceptEdits', 'Write', memory)).toEqual(allow('accept-edits'));
      expect(
        onPath('acceptEdits', 'Write', memory, { protectedPaths: { restricted: true } }),
      ).toEqual(ask('protected-path'));
    });
  });

  describe('"Protected paths": a shell command that writes there', () => {
    test('is not auto-approved by acceptEdits', () => {
      expect(decision('acceptEdits', 'Bash', { command: 'touch .vscode/settings.json' })).toEqual(
        ask('protected-path'),
      );
      expect(decision('acceptEdits', 'Bash', { command: 'rm .git/hooks/pre-commit' })).toEqual(
        ask('protected-path'),
      );
    });
  });
});

describe('permissions.md, "Network paths"', () => {
  const NETWORK: { readonly [M in PermissionMode]: ReturnType<typeof ask> } = {
    default: ask('network-path'),
    acceptEdits: ask('network-path'),
    plan: ask('network-path'),
    auto: ask('network-path'),
    dontAsk: deny('network-path'),
    bypassPermissions: allow('mode-bypass'),
  };
  const UNIX = '/net/fileserver/notes.txt';
  const UNC = '\\\\server\\share\\file';
  const windows = {
    match: pathsWith({
      platform: 'windows',
      cwd: 'C:\\work\\app',
      primaryWorkingDirectory: 'C:\\work\\app',
      home: 'C:\\Users\\alice',
    }),
  };

  for (const mode of PERMISSION_MODES) {
    spec(`permissions.mode.${mode}`, () => {
      describe(`in ${mode} mode`, () => {
        test('a read from a /net path leaves the prompt in place despite a bare Read allow rule', () => {
          const rules = rulesOf(['allow', 'Read']);
          expect(onPath(mode, 'Read', UNIX, { rules })).toEqual(NETWORK[mode]);
        });

        test('Grep and Glob read a network path under the same check', () => {
          expect(onPath(mode, 'Grep', UNIX)).toEqual(NETWORK[mode]);
          expect(onPath(mode, 'Glob', UNIX)).toEqual(NETWORK[mode]);
        });

        test('a hook that returns allow does not skip it', () => {
          expect(onPath(mode, 'Read', UNIX, { hook: { decision: 'allow' } })).toEqual(
            NETWORK[mode],
          );
        });

        test('a UNC path on Windows is a network path', () => {
          expect(onPath(mode, 'Read', UNC, windows)).toEqual(NETWORK[mode]);
        });
      });
    });
  }

  spec('permissions.mode.default', () => {
    test('a path that only looks like one is read as any other path', () => {
      expect(onPath('default', 'Read', '/network/x')).toEqual(ask('default-prompt'));
      expect(onPath('default', 'Read', '/netbook/x')).toEqual(ask('default-prompt'));
    });

    test('a path that resolves to a network path prompts', () => {
      const prepared = {
        toolName: 'Read',
        input: { file_path: '/work/app/share/x.txt' },
        resolvedPaths: ['/net/fileserver/x.txt'],
      };
      expect(decisionOf(prepared)).toEqual(ask('network-path'));
    });
  });
});
