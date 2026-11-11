/**
 * Extra scope folders a host names (`ScopeContext.extraScopeFolders`) for agents. sub-agents.md,
 * "Choose the subagent scope" names `.claude/agents/` only: reading another folder is a host extension,
 * a judgment (spec/judgments.md), outside `spec(...)`. The documented priority must hold: within a source
 * a `.claude/agents` file wins a shared name; across sources the table's order stays.
 */
import { describe, expect, test } from 'bun:test';
import { resolveAgents } from '../../../src/agents/catalog/resolve.ts';
import { agent, namesOf, scan } from '../../support/agent-scan.ts';
import { HOME, PROJECT } from '../../support/scan.ts';

const files = {
  [`${PROJECT}/.agents/agents/helper.md`]: agent('helper'),
  [`${PROJECT}/.claude/agents/ship.md`]: agent('ship', 'model: haiku\n'),
  [`${PROJECT}/.agents/agents/ship.md`]: agent('ship', 'model: opus\n'),
  [`${HOME}/.agents/agents/mine.md`]: agent('mine', 'model: opus\n'),
  [`${PROJECT}/.claude/agents/mine.md`]: agent('mine', 'model: haiku\n'),
};

describe('judgment: extra scope folders for agents', () => {
  test('absent, only .claude/agents is read', async () => {
    expect(namesOf(await scan(files))).toEqual(['project:mine', 'project:ship']);
  });

  test('named, <folder>/agents loads in every base of the source, and .claude wins within the source', async () => {
    const outcome = await scan(files, { extraScopeFolders: ['.agents'] });
    expect(namesOf(outcome)).toEqual([
      'project:helper',
      'project:mine',
      'project:ship',
      'project:ship',
      'user:mine',
    ]);
    expect(outcome.watch).toContain(`${PROJECT}/.agents/agents`);
    const catalog = resolveAgents({ scanned: outcome.entries });
    const model = (name: string) =>
      catalog.agents.find((each) => each.name === name)?.definition.model;
    expect(model('ship')).toBe('haiku');
    // The project source outranks the user one, whichever folder each came from.
    expect(model('mine')).toBe('haiku');
    expect(catalog.issues).toEqual([]);
  });
});
