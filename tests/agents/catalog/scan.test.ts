/**
 * sub-agents.md, "Choose the subagent scope" (managed settings, `.claude/agents/` up the tree and in
 * `--add-dir`, `~/.claude/agents/`, recursion into subfolders), "Write subagent files" (what is
 * watched is in scan-skips.test.ts); plugins/components.md, "Organize agents in subfolders". The scan
 * reads the folders through the `FolderScan` port.
 */
import { describe, expect, test } from 'bun:test';
import { scanAgents } from '../../../src/agents/catalog/scan.ts';
import { folderScan } from '../../../src/testing/ports/index.ts';
import { HOME, MANAGED, PROJECT } from '../../support/scan.ts';
import { agent, namesOf, scan } from '../../support/agent-scan.ts';
import { refusing } from '../../support/refusing-folders.ts';
import { spec } from '../../support/spec.ts';
import { tierOf } from '../../support/agent-catalog.ts';

spec('agents.behavior.Choose the subagent scope', () => {
  test('managed, project and user folders are each read and say which scope they are', async () => {
    const outcome = await scan({
      [`${MANAGED}/.claude/agents/policy.md`]: agent('policy'),
      [`${PROJECT}/.claude/agents/ship.md`]: agent('ship'),
      [`${HOME}/.claude/agents/mine.md`]: agent('mine'),
    });
    expect(namesOf(outcome)).toEqual(['managed:policy', 'project:ship', 'user:mine']);
    expect(outcome.issues).toEqual([]);
  });

  test('a folder that does not exist is nothing, not an error', async () => {
    const outcome = await scan({ [`${HOME}/notes.txt`]: 'x' });
    expect(outcome.entries).toEqual([]);
    expect(outcome.issues).toEqual([]);
  });
});

spec('agents.behavior.Choose the subagent scope.Managed settings', () => {
  test('markdown files in .claude/agents/ inside the managed settings directory load, in the same format', async () => {
    const outcome = await scan({
      [`${MANAGED}/.claude/agents/auditor.md`]: agent(
        'auditor',
        'tools: Read, Grep\nmodel: haiku\n',
      ),
    });
    const [entry] = outcome.entries;
    expect(tierOf(entry?.agent)).toBe('managed');
    expect(entry?.agent.definition).toMatchObject({
      description: 'auditor agent',
      tools: ['Read', 'Grep'],
      model: 'haiku',
      prompt: 'You are auditor.\n',
    });
    expect(entry?.agent.path).toBe(`${MANAGED}/.claude/agents/auditor.md`);
  });

  test('a host with no managed settings directory has no managed agents', async () => {
    const outcome = await scanAgents({
      folders: folderScan({ [`${MANAGED}/.claude/agents/a.md`]: agent('a') }),
      request: { home: HOME, cwd: PROJECT },
    });
    expect(outcome.entries).toEqual([]);
  });
});

spec('agents.behavior.Choose the subagent scope..claude/agents/', () => {
  test('every .claude/agents/ from the working directory up to the repository root is scanned, nearest first', async () => {
    const outcome = await scan(
      {
        '/repo/.claude/agents/root.md': agent('root'),
        '/repo/apps/.claude/agents/apps.md': agent('apps'),
        '/repo/apps/web/.claude/agents/web.md': agent('web'),
        '/elsewhere/.claude/agents/outside.md': agent('outside'),
      },
      { cwd: '/repo/apps/web', repositories: ['/repo'] },
    );
    const byOrder = outcome.entries.toSorted((a, b) => a.order - b.order);
    expect(byOrder.map((entry) => entry.agent.name)).toEqual(['web', 'apps', 'root']);
  });

  test('a directory added with --add-dir has its .claude/agents/ loaded alongside the project subagents', async () => {
    const outcome = await scan(
      {
        [`${PROJECT}/.claude/agents/own.md`]: agent('own'),
        '/shared/.claude/agents/team.md': agent('team'),
      },
      { addedDirectories: ['/shared'] },
    );
    expect(namesOf(outcome)).toEqual(['project:own', 'project:team']);
    const team = outcome.entries.find((entry) => entry.agent.name === 'team');
    const own = outcome.entries.find((entry) => entry.agent.name === 'own');
    expect(team?.base).toBe('/shared');
    // Judgment (spec/judgments.md): the project's own folders come first.
    expect(own?.order).toBeLessThan(team?.order ?? -1);
  });
});

spec('agents.behavior.Choose the subagent scope.~/.claude/agents/', () => {
  test('personal agents are read from the home directory only', async () => {
    const outcome = await scan({
      [`${HOME}/.claude/agents/mine.md`]: agent('mine'),
      [`${HOME}/projects/.claude/agents/not-mine.md`]: agent('not-mine'),
    });
    expect(namesOf(outcome)).toEqual(['user:mine']);
  });
});

describe('subfolders of an agents directory', () => {
  spec('agents.behavior.Choose the subagent scope', () => {
    test('the folders are scanned recursively; the path does not change how the agent is identified', async () => {
      const outcome = await scan({
        [`${PROJECT}/.claude/agents/review/security.md`]: agent('sec-reviewer'),
        [`${PROJECT}/.claude/agents/research/deep/web.md`]: agent('web-research'),
        [`${HOME}/.claude/agents/review/style.md`]: agent('style'),
      });
      expect(namesOf(outcome)).toEqual([
        'project:sec-reviewer',
        'project:web-research',
        'user:style',
      ]);
      for (const entry of outcome.entries) {
        expect(entry.agent.name).toBe(entry.agent.ownName);
      }
    });
  });
});

const worktreeScan = (files: Record<string, string>) =>
  scanAgents({
    folders: folderScan(files, { worktrees: { '/wt': '/main' } }),
    request: { home: HOME, cwd: '/wt' },
  });

describe('judgments of the agents scan (spec/judgments.md)', () => {
  test('in a linked worktree without its own .claude/skills the main checkout agents load too, last', async () => {
    const outcome = await worktreeScan({
      '/wt/.claude/agents/own.md': agent('own'),
      '/main/.claude/agents/main-only.md': agent('main-only'),
    });
    expect(namesOf(outcome)).toEqual(['project:main-only', 'project:own']);
    const order = (name: string) => outcome.entries.find((e) => e.agent.name === name)?.order;
    expect(order('own')).toBeLessThan(order('main-only') ?? -1);
  });

  test('when the worktree top has its own .claude/skills the main checkout agents do not load', async () => {
    const outcome = await worktreeScan({
      '/wt/.claude/agents/own.md': agent('own'),
      '/wt/.claude/skills/lint/SKILL.md': '---\nname: lint\ndescription: lint\n---\nLint.\n',
      '/main/.claude/agents/main-only.md': agent('main-only'),
    });
    expect(namesOf(outcome)).toEqual(['project:own']);
  });

  test('strictPluginOnlyCustomization stops the personal, project and added folders, never the managed one', async () => {
    const outcome = await scan(
      {
        [`${MANAGED}/.claude/agents/policy.md`]: agent('policy'),
        [`${HOME}/.claude/agents/mine.md`]: agent('mine'),
        [`${PROJECT}/.claude/agents/ship.md`]: agent('ship'),
        '/shared/.claude/agents/team.md': agent('team'),
      },
      { addedDirectories: ['/shared'], allows: (origin) => origin === 'managedDirectory' },
    );
    expect(namesOf(outcome)).toEqual(['managed:policy']);
  });
});

describe('a port that refuses an agent file', () => {
  test('skips that file with a warning that carries the port message, and lists the others', async () => {
    const files = {
      [`${HOME}/.claude/agents/big.md`]: agent('big'),
      [`${HOME}/.claude/agents/small.md`]: agent('small'),
    };
    const folders = refusing(folderScan(files), 'big.md', 'file is 2 MiB');
    const outcome = await scanAgents({ folders, request: { home: HOME, cwd: PROJECT } });
    expect(outcome.entries.map((entry) => entry.agent.name)).toEqual(['small']);
    expect(outcome.issues.map((issue) => issue.message).join('\n')).toContain('file is 2 MiB');
  });
});
