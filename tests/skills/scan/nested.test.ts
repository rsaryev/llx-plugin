/**
 * Skills of parent and nested directories (skills.md, "Load skills in monorepos and subdirectories",
 * "Choose where skills load", "Resolve skills that share a name"): the parents up to the repository
 * root load at startup, a `.claude/skills` below the working directory loads when Claude touches a
 * file there, a linked worktree stops at its own top and may borrow the main checkout's skills.
 */
import { describe, expect, test } from 'bun:test';
import { resolveFolderSkills, scanFolders, scanNested } from '../../../src/skills/index.ts';
import { spec } from '../../support/spec.ts';
import {
  commandsOf,
  portOf,
  requestOf,
  resolvedOf,
  skillText,
  type Scenario,
} from '../../support/scan.ts';

const MONO = '/work/mono';
const at = (root: string, name: string) => `${root}/.claude/skills/${name}/SKILL.md`;

const inRepo = (cwd: string): Scenario => ({
  request: { cwd },
  disk: { repositories: [MONO] },
});

spec('skills.behavior.Load skills in monorepos and subdirectories', () => {
  const files = {
    [at(MONO, 'release')]: skillText('root release'),
    [at(`${MONO}/packages`, 'shared')]: skillText('packages shared'),
    [at(`${MONO}/packages/frontend`, 'storybook')]: skillText('frontend storybook'),
    [at(`${MONO}/packages/backend`, 'migrate')]: skillText('backend migrate'),
  };

  test('starting in packages/frontend still picks up the skills defined at the repository root and on the way', async () => {
    const resolution = await resolvedOf(files, inRepo(`${MONO}/packages/frontend`));
    expect(commandsOf(resolution)).toEqual(['release', 'shared', 'storybook']);
  });

  test('a skills directory below where the session started does not load at startup', async () => {
    const resolution = await resolvedOf(files, inRepo(MONO));
    expect(commandsOf(resolution)).toEqual(['release']);
  });

  test('it loads the first time Claude touches a file in that subdirectory, and stays for the session', async () => {
    const scenario = inRepo(MONO);
    const context = { folders: portOf(files, scenario), request: requestOf(scenario) };
    const first = await scanNested(context, `${MONO}/packages/frontend/src/app.ts`);
    expect(first.entries.map((entry) => entry.invocable.command).toSorted()).toEqual([
      'shared',
      'storybook',
    ]);
    expect(first.directories).toEqual([
      `${MONO}/packages`,
      `${MONO}/packages/frontend`,
      `${MONO}/packages/frontend/src`,
    ]);
    const loaded = new Set(first.directories);
    const again = await scanNested(context, `${MONO}/packages/frontend/src/other.ts`, loaded);
    expect(again.entries).toEqual([]);
    const sibling = await scanNested(context, `${MONO}/packages/backend/db.ts`, loaded);
    expect(sibling.entries.map((entry) => entry.invocable.command)).toEqual(['migrate']);
  });

  test('a file outside the working directory loads nothing', async () => {
    const scenario = inRepo(MONO);
    const context = { folders: portOf(files, scenario), request: requestOf(scenario) };
    const outside = await scanNested(context, '/elsewhere/packages/x.ts');
    expect(outside.entries).toEqual([]);
    expect(outside.directories).toEqual([]);
  });
});

describe('a linked git worktree', () => {
  const WORKTREE = '/work/wt';
  const disk = { repositories: [MONO], worktrees: { [WORKTREE]: MONO } };

  spec('skills.behavior.Load skills in monorepos and subdirectories', () => {
    test('parent directories are searched only up to the worktree root', async () => {
      const files = {
        [at(`${WORKTREE}/packages/ui`, 'ui')]: skillText('ui'),
        [at(WORKTREE, 'wt-root')]: skillText('worktree root'),
        '/work/.claude/skills/outside/SKILL.md': skillText('outside the worktree'),
      };
      const resolution = await resolvedOf(files, {
        request: { cwd: `${WORKTREE}/packages/ui` },
        disk,
      });
      expect(commandsOf(resolution)).toEqual(['ui', 'wt-root']);
    });

    test('a worktree checkout with no .claude/skills at its root loads the main checkout project skills instead', async () => {
      const files = {
        [at(MONO, 'release')]: skillText('main checkout release'),
        [`${WORKTREE}/src/index.ts`]: 'code',
      };
      const resolution = await resolvedOf(files, { request: { cwd: WORKTREE }, disk });
      expect(commandsOf(resolution)).toEqual(['release']);
    });

    test('a worktree with its own .claude/skills at the root does not borrow from the main checkout', async () => {
      const files = {
        [at(MONO, 'release')]: skillText('main checkout release'),
        [at(WORKTREE, 'wt-root')]: skillText('worktree root'),
      };
      const resolution = await resolvedOf(files, { request: { cwd: WORKTREE }, disk });
      expect(commandsOf(resolution)).toEqual(['wt-root']);
    });
  });
});

describe('a project-root skill and a nested skill', () => {
  const files = {
    [at(MONO, 'deploy')]: skillText('root deploy'),
    [at(`${MONO}/apps/web`, 'deploy')]: skillText('web deploy'),
    [at(`${MONO}/apps/web`, 'lint')]: skillText('web lint'),
  };

  async function withNested() {
    const scenario = inRepo(MONO);
    const context = { folders: portOf(files, scenario), request: requestOf(scenario) };
    const root = await scanFolders(context);
    const nested = await scanNested(context, `${MONO}/apps/web/src/page.ts`);
    return resolveFolderSkills([...root.entries, ...nested.entries], { cwd: MONO });
  }

  spec(
    'skills.behavior.Resolve skills that share a name.A project-root skill and a nested skill',
    () => {
      test('both load: /deploy runs the root skill, /apps/web:deploy the nested one', async () => {
        const resolution = await withNested();
        expect(commandsOf(resolution)).toEqual(['apps/web:deploy', 'deploy', 'lint']);
        const nested = resolution.resolved.find((each) => each.names.includes('apps/web:deploy'));
        expect(nested?.invocable.description).toContain('apps/web');
        expect(nested?.invocable.description).toContain('web deploy');
        const root = resolution.resolved.find((each) => each.names.includes('deploy'));
        expect(root?.invocable.description).toBe('root deploy');
      });

      test('a nested skill whose name is free keeps its plain name', async () => {
        const resolution = await withNested();
        const lint = resolution.resolved.find((each) => each.names.includes('lint'));
        expect(lint?.invocable.description).toBe('web lint');
      });
    },
  );

  spec('skills.behavior.Choose where skills load.Nested', () => {
    test('<subdir>/.claude/skills/<skill-name>/SKILL.md loads for work in or below <subdir>', async () => {
      const resolution = await withNested();
      expect(resolution.resolved.filter((each) => each.scope === 'nested')).toHaveLength(2);
    });

    test('and is not loaded for a session that never touches that subdirectory', async () => {
      const resolution = await resolvedOf(files, inRepo(MONO));
      expect(resolution.resolved.some((each) => each.scope === 'nested')).toBe(false);
    });
  });
});
