/**
 * workflows.md § Save the workflow for reuse: the two save locations, `.claude/workflows/` in the
 * project and `~/.claude/workflows/` (the `workflows/` directory under `CLAUDE_CONFIG_DIR` when set);
 * "The workflow runs as `/<name>` in future sessions from either location"; the symlink rules ("Project
 * location: Claude Code refuses if `.claude`, `.claude/workflows`, or the target file is a symlink.
 * Personal location: Claude Code refuses only if the target file itself is a symlink"); in a monorepo
 * "Saving to the project location writes to the closest `.claude/workflows/` directory that already
 * exists between your working directory and the repository root, or to the repository root if none
 * exists yet. Project workflows also load from every `.claude/workflows/` along that path, and when
 * more than one defines the same name Claude Code runs the one closest to the working directory. If a
 * project workflow and a personal workflow share a name, the project one runs." What the docs leave
 * open (file names, ties inside one folder, a script without `meta`) is tested outside spec().
 */
import { describe, expect, test } from 'bun:test';
import {
  planWorkflowSave,
  refuseLinks,
  resolveSavedWorkflows,
  scanSavedWorkflows,
  type SaveRequest,
} from '../../../src/agents/workflow/index.ts';
import { folderScan } from '../../support/ports.ts';
import { spec } from '../../support/spec.ts';

const join = (base: string, relative: string): string => `${base}/${relative}`;

const HOME = '/home/user';
const REPO = '/work/mono';
const PACKAGE = '/work/mono/packages/web';
const CWD = '/work/mono/packages/web/src';

const request = (change: Partial<SaveRequest> = {}): SaveRequest => ({
  scope: 'project',
  name: 'review',
  directories: [CWD, PACKAGE, '/work/mono/packages', REPO],
  withWorkflows: new Set(),
  home: HOME,
  join,
  ...change,
});

const planned = (change: Partial<SaveRequest> = {}) => {
  const outcome = planWorkflowSave(request(change));
  if (outcome.plan === undefined) throw new Error('no plan');
  return outcome.plan;
};

const script = (name: string): string =>
  `export const meta = { name: '${name}', description: 'd' }\nreturn 1\n`;

spec('workflows.behavior.Save the workflow for reuse', () => {
  test('the project location is .claude/workflows/ and the personal one ~/.claude/workflows/, the file named after the workflow', () => {
    const project = planned({ directories: [REPO] });
    expect(project.path).toBe('/work/mono/.claude/workflows/review.js');
    expect(project.directory).toBe('/work/mono/.claude/workflows');
    const personal = planned({ scope: 'personal' });
    expect(personal.path).toBe('/home/user/.claude/workflows/review.js');
  });

  test('with CLAUDE_CONFIG_DIR the personal location is the workflows/ directory under that path', () => {
    const plan = planned({ scope: 'personal', configDir: '/cfg/claude' });
    expect(plan.directory).toBe('/cfg/claude/workflows');
    expect(plan.path).toBe('/cfg/claude/workflows/review.js');
  });

  test('a monorepo: the closest .claude/workflows/ that already exists between the working directory and the root', () => {
    const plan = planned({ withWorkflows: new Set([PACKAGE, REPO]) });
    expect(plan.directory).toBe('/work/mono/packages/web/.claude/workflows');
  });

  test('a monorepo with none yet: the repository root', () => {
    expect(planned().directory).toBe('/work/mono/.claude/workflows');
  });

  test('the working directory is the closest of all when it has its own', () => {
    expect(planned({ withWorkflows: new Set([CWD, REPO]) }).directory).toBe(
      '/work/mono/packages/web/src/.claude/workflows',
    );
  });

  test('project: the paths that must not be symlinks are .claude, .claude/workflows and the target file', () => {
    const plan = planned({ directories: [REPO] });
    expect(plan.mustNotBeLinks).toEqual([
      '/work/mono/.claude',
      '/work/mono/.claude/workflows',
      '/work/mono/.claude/workflows/review.js',
    ]);
    for (const path of plan.mustNotBeLinks) {
      const refused = refuseLinks(plan, new Set([path]));
      expect(refused?.severity).toBe('error');
      expect(refused?.message).toContain(path);
    }
    expect(refuseLinks(plan, new Set())).toBeUndefined();
  });

  test('personal: only the target file itself, so a ~/.claude managed by a dotfiles tool still works', () => {
    const plan = planned({ scope: 'personal' });
    expect(plan.mustNotBeLinks).toEqual(['/home/user/.claude/workflows/review.js']);
    expect(
      refuseLinks(plan, new Set(['/home/user/.claude', '/home/user/.claude/workflows'])),
    ).toBeUndefined();
    expect(refuseLinks(plan, new Set(['/home/user/.claude/workflows/review.js']))?.severity).toBe(
      'error',
    );
  });

  test('a project workflow wins over a personal one of the same name', () => {
    const resolved = resolveSavedWorkflows([
      {
        name: 'review',
        scope: 'personal',
        distance: 0,
        path: '/home/user/.claude/workflows/review.js',
      },
      {
        name: 'review',
        scope: 'project',
        distance: 3,
        path: '/work/mono/.claude/workflows/review.js',
      },
    ]);
    expect(resolved.winners.map((w) => w.scope)).toEqual(['project']);
    expect(resolved.shadowed.map((w) => w.scope)).toEqual(['personal']);
  });

  test('of two project workflows with one name, the one closest to the working directory runs', () => {
    const resolved = resolveSavedWorkflows([
      {
        name: 'review',
        scope: 'project',
        distance: 2,
        path: '/work/mono/.claude/workflows/review.js',
      },
      {
        name: 'review',
        scope: 'project',
        distance: 1,
        path: '/work/mono/packages/web/.claude/workflows/review.js',
      },
    ]);
    expect(resolved.winners.map((w) => w.path)).toEqual([
      '/work/mono/packages/web/.claude/workflows/review.js',
    ]);
    expect(resolved.shadowed).toHaveLength(1);
  });

  test('read from the folders: every .claude/workflows/ along the path and the personal one load, and the closest of a name runs as /<name>', async () => {
    const files = {
      '/work/mono/.claude/workflows/review.js': script('review'),
      '/work/mono/.claude/workflows/audit.js': script('audit'),
      '/work/mono/packages/web/.claude/workflows/review.js': script('review'),
      '/home/user/.claude/workflows/audit.js': script('audit'),
      '/home/user/.claude/workflows/mine.js': script('mine'),
    };
    const scan = await scanSavedWorkflows(folderScan(files, { repositories: [REPO] }), {
      cwd: CWD,
      home: HOME,
    });
    const paths = Object.fromEntries(scan.winners.map((w) => [w.name, w.path]));
    expect(paths).toEqual({
      review: '/work/mono/packages/web/.claude/workflows/review.js',
      audit: '/work/mono/.claude/workflows/audit.js',
      mine: '/home/user/.claude/workflows/mine.js',
    });
    expect(scan.shadowed.map((w) => w.path).toSorted()).toEqual([
      '/home/user/.claude/workflows/audit.js',
      '/work/mono/.claude/workflows/review.js',
    ]);
  });

  test('the workflow runs as /<name> from the meta name, not from the file name', async () => {
    const files = { '/work/mono/.claude/workflows/file-name.js': script('meta-name') };
    const scan = await scanSavedWorkflows(folderScan(files, { repositories: [REPO] }), {
      cwd: REPO,
      home: HOME,
    });
    expect(scan.winners.map((w) => w.name)).toEqual(['meta-name']);
  });

  test('with CLAUDE_CONFIG_DIR set the personal workflows are read from its workflows/ folder, not from ~/.claude', async () => {
    const files = {
      '/cfg/claude/workflows/mine.js': script('mine'),
      '/home/user/.claude/workflows/old.js': script('old'),
    };
    const scan = await scanSavedWorkflows(folderScan(files), {
      cwd: REPO,
      home: HOME,
      configDir: '/cfg/claude',
    });
    expect(scan.winners.map((w) => w.name)).toEqual(['mine']);
  });
});

describe('judgments: names and unreadable scripts', () => {
  test('a name that is not one file name is refused, with an error and no plan', () => {
    for (const name of ['', '.', '..', 'a/b', 'a\\b', 'a\0b']) {
      const outcome = planWorkflowSave(request({ name }));
      expect(outcome.plan).toBeUndefined();
      expect(outcome.issue?.severity).toBe('error');
    }
  });

  test('with no working directory the project location has nowhere to go', () => {
    const outcome = planWorkflowSave(request({ directories: [] }));
    expect(outcome.plan).toBeUndefined();
    expect(outcome.issue?.severity).toBe('error');
  });

  test('two files of one folder with one name: the first path in code-unit order runs', () => {
    const resolved = resolveSavedWorkflows([
      { name: 'r', scope: 'project', distance: 0, path: '/p/.claude/workflows/b.js' },
      { name: 'r', scope: 'project', distance: 0, path: '/p/.claude/workflows/a.js' },
    ]);
    expect(resolved.winners.map((w) => w.path)).toEqual(['/p/.claude/workflows/a.js']);
  });

  test('the order of that tie is by code unit, not by the host locale: an upper-case name sorts before a lower-case one', () => {
    const resolved = resolveSavedWorkflows([
      { name: 'r', scope: 'project', distance: 0, path: '/p/.claude/workflows/a.js' },
      { name: 'r', scope: 'project', distance: 0, path: '/p/.claude/workflows/B.js' },
    ]);
    expect(resolved.winners.map((w) => w.path)).toEqual(['/p/.claude/workflows/B.js']);
  });

  test('a script without a readable meta is left out of the list, with the issue at its file', async () => {
    const files = { '/work/mono/.claude/workflows/broken.js': 'return 1\n' };
    const scan = await scanSavedWorkflows(folderScan(files, { repositories: [REPO] }), {
      cwd: REPO,
      home: HOME,
    });
    expect(scan.winners).toEqual([]);
    expect(scan.issues.length).toBeGreaterThan(0);
    expect(scan.issues[0]?.path).toBe('/work/mono/.claude/workflows/broken.js');
  });

  test('only .js files are workflows: other files in the folder are ignored', async () => {
    const files = {
      '/work/mono/.claude/workflows/notes.md': 'text',
      '/work/mono/.claude/workflows/ok.js': script('ok'),
    };
    const scan = await scanSavedWorkflows(folderScan(files, { repositories: [REPO] }), {
      cwd: REPO,
      home: HOME,
    });
    expect(scan.winners.map((w) => w.name)).toEqual(['ok']);
  });
});
