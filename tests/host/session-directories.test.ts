/**
 * A live session whose directories change (skills.md, "Load skills in monorepos and subdirectories":
 * "When you move the session with `/cd` ... Claude Code adds the new directory's project skills";
 * "Load skills from a directory outside the project": `--add-dir` or `/add-dir`; permissions.md,
 * "Move the session to another directory"): the session keeps its skill hooks and its `once` keys,
 * and the folders are read again. End-to-end over the real loader, the scan, the resolution and the
 * fakes of the ports.
 */
import { describe, expect, test } from 'bun:test';
import { signal } from '../support/host.ts';
import { HOME, PROJECT, folderHostOf, menuOf, skillText } from '../support/scan.ts';
import { spec } from '../support/spec.ts';

const MONO = '/work/mono';
const skillFile = (root: string, name: string) => `${root}/.claude/skills/${name}/SKILL.md`;
const disk = { repositories: [MONO] };
const hereOf = (cwd: string) => ({ session: { cwd }, disk });

const ONCE_HOOK = [
  'hooks:',
  '  PostToolUse:',
  '    - hooks:',
  '        - type: command',
  '          command: ./once.sh',
  '          once: true',
];
const done = {
  tool_name: 'Bash',
  tool_input: { command: 'ls' },
  tool_use_id: 't1',
  tool_response: {},
  duration_ms: 1,
};

const monorepo = (): Record<string, string> => ({
  [skillFile(MONO, 'release')]: skillText('root release'),
  [skillFile(`${MONO}/packages`, 'shared')]: skillText('packages shared'),
  [skillFile(`${MONO}/packages/backend`, 'migrate')]: skillText('backend migrate'),
  [skillFile(`${MONO}/packages/frontend`, 'storybook')]: skillText('frontend storybook'),
});

const withAudit = (): Record<string, string> => ({
  ...monorepo(),
  [skillFile(MONO, 'audit')]: skillText('Audit', ...ONCE_HOOK),
});

spec('skills.behavior.Load skills in monorepos and subdirectories', () => {
  test('/cd on a live session adds the new directory project skills and drops the old directory own', async () => {
    const { session } = folderHostOf(monorepo(), hereOf(`${MONO}/packages/backend`));
    await session.reloadSkills({ signal: signal() });
    expect(menuOf(session)).toEqual(['migrate', 'release', 'shared']);
    const moved = await session.moveTo(`${MONO}/packages/frontend`, { signal: signal() });
    expect(moved.issues).toEqual([]);
    expect(menuOf(session)).toEqual(['release', 'shared', 'storybook']);
  });

  test('moving above the project root leaves only what is on the new chain', async () => {
    const { session } = folderHostOf(monorepo(), hereOf(`${MONO}/packages/backend`));
    await session.reloadSkills({ signal: signal() });
    await session.moveTo(MONO, { signal: signal() });
    expect(menuOf(session)).toEqual(['release']);
  });
});

spec('permissions.behavior.Move the session to another directory', () => {
  const guarded = withAudit;

  test('the skill hooks and the `once` keys stay: a hook that ran does not run again after /cd', async () => {
    const { session, runner } = folderHostOf(guarded(), {
      ...hereOf(`${MONO}/packages/backend`),
      runs: [{}, {}, {}],
    });
    await session.reloadSkills({ signal: signal() });
    expect((await session.expandSkill('audit', { signal: signal() })).ok).toBe(true);
    await session.dispatch('PostToolUse', done, { signal: signal() });
    expect(runner.calls).toHaveLength(1);
    await session.moveTo(`${MONO}/packages/frontend`, { signal: signal() });
    await session.dispatch('PostToolUse', done, { signal: signal() });
    expect(runner.calls).toHaveLength(1);
  });

  test('a skill hook that has not run yet still runs after /cd, and sees the new working directory', async () => {
    const { session, runner } = folderHostOf(guarded(), {
      ...hereOf(`${MONO}/packages/backend`),
      runs: [{}, {}],
    });
    await session.reloadSkills({ signal: signal() });
    await session.expandSkill('audit', { signal: signal() });
    await session.moveTo(`${MONO}/packages/frontend`, { signal: signal() });
    await session.dispatch('PostToolUse', done, { signal: signal() });
    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0]?.stdin).toContain(`"cwd":"${MONO}/packages/frontend"`);
  });

  test('the nested directories a touched file loaded stay when they are below the new directory', async () => {
    const files = {
      ...monorepo(),
      [skillFile(`${MONO}/packages/backend/jobs`, 'queue')]: skillText('queue'),
    };
    const { session } = folderHostOf(files, hereOf(MONO));
    await session.reloadSkills({ signal: signal() });
    await session.touchFile(`${MONO}/packages/backend/jobs/run.ts`, { signal: signal() });
    expect(menuOf(session)).toContain('queue');
    await session.moveTo(`${MONO}/packages/backend`, { signal: signal() });
    expect(menuOf(session)).toEqual(['migrate', 'queue', 'release', 'shared']);
    await session.moveTo(`${MONO}/packages/frontend`, { signal: signal() });
    expect(menuOf(session)).toEqual(['release', 'shared', 'storybook']);
  });

  test('the directories added with /add-dir stay across /cd', async () => {
    const files = { ...monorepo(), [skillFile('/work/cli', 'verify')]: skillText('cli verify') };
    const { session } = folderHostOf(files, hereOf(`${MONO}/packages/backend`));
    await session.addDirectory('/work/cli', { signal: signal() });
    await session.moveTo(`${MONO}/packages/frontend`, { signal: signal() });
    expect(menuOf(session)).toEqual(['release', 'shared', 'storybook', 'verify']);
  });
});

spec(
  [
    'skills.behavior.Choose where skills load.Additional directory',
    'permissions.behavior.Working directories.During session',
  ],
  () => {
    const files = {
      [skillFile(PROJECT, 'verify')]: skillText('project verify'),
      [skillFile('/work/cli', 'verify')]: skillText('cli verify'),
      [skillFile('/work/docs', 'publish')]: skillText('docs publish'),
      [`/work/docs/.claude/commands/draft.md`]: skillText('docs draft'),
    };

    test('/add-dir on a live session loads that directory skills and commands now, in the order added', async () => {
      const { session } = folderHostOf(files);
      await session.reloadSkills({ signal: signal() });
      expect(menuOf(session)).toEqual(['verify']);
      await session.addDirectory('/work/cli', { signal: signal() });
      expect(menuOf(session)).toEqual(['cli:verify', 'verify']);
      await session.addDirectory('/work/docs', { signal: signal() });
      expect(menuOf(session)).toEqual(['cli:verify', 'draft', 'publish', 'verify']);
    });

    test('adding a directory twice changes nothing', async () => {
      const { session } = folderHostOf(files);
      await session.addDirectory('/work/cli', { signal: signal() });
      await session.addDirectory('/work/cli', { signal: signal() });
      expect(menuOf(session)).toEqual(['cli:verify', 'verify']);
    });

    test('the session keeps its skill hooks and once keys across /add-dir', async () => {
      const audit = { [skillFile(PROJECT, 'audit')]: skillText('Audit', ...ONCE_HOOK) };
      const { session, runner } = folderHostOf({ ...files, ...audit }, { runs: [{}, {}] });
      await session.reloadSkills({ signal: signal() });
      await session.expandSkill('audit', { signal: signal() });
      await session.dispatch('PostToolUse', done, { signal: signal() });
      await session.addDirectory('/work/cli', { signal: signal() });
      await session.dispatch('PostToolUse', done, { signal: signal() });
      expect(runner.calls).toHaveLength(1);
    });

    test('a subdirectory added with /add-dir loads now, as an added directory, and a touched file does not load it again', async () => {
      const nested = { [skillFile(`${PROJECT}/apps/web`, 'lint')]: skillText('web lint') };
      const { session } = folderHostOf(nested);
      await session.addDirectory(`${PROJECT}/apps/web`, { signal: signal() });
      expect(menuOf(session)).toEqual(['lint']);
      await session.touchFile(`${PROJECT}/apps/web/src/page.ts`, { signal: signal() });
      await session.reloadSkills({ signal: signal() });
      expect(menuOf(session)).toEqual(['lint']);
    });

    test('a subdirectory a touched file loaded, then added, is read as an added directory only', async () => {
      const nested = { [skillFile(`${PROJECT}/apps/web`, 'lint')]: skillText('web lint') };
      const { session } = folderHostOf(nested);
      await session.touchFile(`${PROJECT}/apps/web/src/page.ts`, { signal: signal() });
      await session.addDirectory(`${PROJECT}/apps/web`, { signal: signal() });
      expect(menuOf(session)).toEqual(['lint']);
    });
  },
);

describe('reads that overlap', () => {
  test('a touched file that finishes during a reload keeps its skills', async () => {
    const files = {
      [skillFile(HOME, 'one')]: skillText('One'),
      [skillFile(`${PROJECT}/apps/web`, 'lint')]: skillText('web lint'),
    };
    const { session } = folderHostOf(files);
    await Promise.all([
      session.reloadSkills({ signal: signal() }),
      session.touchFile(`${PROJECT}/apps/web/src/page.ts`, { signal: signal() }),
    ]);
    expect(menuOf(session)).toEqual(['lint', 'one']);
    await session.reloadSkills({ signal: signal() });
    expect(menuOf(session)).toEqual(['lint', 'one']);
  });

  test('a touch queued behind a reload that is already reading is not overwritten by it', async () => {
    const files = {
      [skillFile(`${PROJECT}/apps/web`, 'lint')]: skillText('web lint'),
      [skillFile(`${PROJECT}/apps/api`, 'serve')]: skillText('api serve'),
    };
    const { session } = folderHostOf(files);
    await session.touchFile(`${PROJECT}/apps/web/src/a.ts`, { signal: signal() });
    await Promise.all([
      session.touchFile(`${PROJECT}/apps/api/src/b.ts`, { signal: signal() }),
      session.reloadSkills({ signal: signal() }),
      session.reloadSkills({ signal: signal() }),
    ]);
    expect(menuOf(session)).toEqual(['lint', 'serve']);
  });
});

describe('the commands other sources use', () => {
  const synced = `${HOME}/.claude/skills/synced/usage/SKILL.md`;

  spec(
    'skills.behavior.Resolve skills that share a name.Any of the above and the short name of a skill synced from your claude.ai account',
    () => {
      test('a command the host names (takenCommands) keeps the short name; the synced skill runs under its full name', async () => {
        const { session } = folderHostOf(
          { [synced]: skillText('synced usage') },
          { session: { takenCommands: ['usage'] } },
        );
        await session.reloadSkills({ signal: signal() });
        expect(menuOf(session)).toEqual(['anthropic-skills:usage']);
        const full = await session.expandSkill('anthropic-skills:usage', { signal: signal() });
        expect(full.ok).toBe(true);
        expect((await session.expandSkill('usage', { signal: signal() })).ok).toBe(false);
      });

      test('without takenCommands the synced skill has the short name', async () => {
        const { session } = folderHostOf({ [synced]: skillText('synced usage') });
        await session.reloadSkills({ signal: signal() });
        expect(menuOf(session)).toEqual(['usage']);
      });
    },
  );

  spec(
    'skills.behavior.Resolve skills that share a name.Any of those locations and a built-in command',
    () => {
      test('a project skill replaces the built-in command of its name, and only its own name', async () => {
        const files = { [skillFile(PROJECT, 'usage')]: skillText('project usage') };
        const { session } = folderHostOf(files, { session: { takenCommands: ['usage', 'cost'] } });
        await session.reloadSkills({ signal: signal() });
        expect(menuOf(session)).toEqual(['usage']);
        expect((await session.expandSkill('usage', { signal: signal() })).ok).toBe(true);
        expect((await session.expandSkill('cost', { signal: signal() })).ok).toBe(false);
      });
    },
  );

  spec(
    'skills.behavior.Resolve skills that share a name.Any of those locations and a bundled skill',
    () => {
      test('a personal skill replaces the bundled command of its name, not its alias', async () => {
        const files = { [skillFile(HOME, 'code-review')]: skillText('my review') };
        const taken = ['code-review', 'review'];
        const { session } = folderHostOf(files, { session: { takenCommands: taken } });
        await session.reloadSkills({ signal: signal() });
        expect(menuOf(session)).toEqual(['code-review']);
        expect((await session.expandSkill('review', { signal: signal() })).ok).toBe(false);
      });
    },
  );
});
