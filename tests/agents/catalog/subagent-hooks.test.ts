/**
 * sub-agents.md, "Project-level hooks for subagent events": `SubagentStart` and `SubagentStop` in
 * `settings.json` match "the agent's frontmatter `name` for project-level and user-level subagents,
 * or the plugin-scoped identifier such as `my-plugin:db-agent` for plugin subagents"; a scoped name
 * has a colon, so it is an unanchored regular expression, anchored with `^` and `$`. The agent type a
 * hook receives is the catalog entry's name.
 */
import { expect, test } from 'bun:test';
import { builtinAgents } from '../../../src/agents/catalog/builtin.ts';
import { resolveAgents } from '../../../src/agents/catalog/resolve.ts';
import { readAgent } from '../../../src/format/agent.ts';
import { readFlagAgents } from '../../../src/format/agent-flag.ts';
import { hookAgentType } from '../../../src/format/agent-name.ts';
import { catalogAgentOf } from '../../../src/agents/catalog/types.ts';
import { loaded } from '../../support/agent-files.ts';
import { command, entry, FACTS, select } from '../../support/hooks-select.ts';
import { spec } from '../../support/spec.ts';
import { pluginAgent, scannedAgent } from '../../support/agent-catalog.ts';

const catalog = resolveAgents({
  builtin: builtinAgents({ interactive: true, disableExplorePlan: false, disableAll: false }),
  scanned: [
    // The file name is not the name: only the frontmatter `name` counts.
    scannedAgent('project', 'db-agent', { path: '/work/app/.claude/agents/database.md' }),
    scannedAgent('user', 'reviewer'),
  ],
  plugin: [pluginAgent('my-plugin', 'db-agent'), pluginAgent('my-plugin', 'db-agent-2')],
});

const text = (name: string) => `---\nname: ${name}\ndescription: d\n---\nPrompt.\n`;

const read = (name: string, origin: Parameters<typeof readAgent>[1]) =>
  loaded(readAgent(text(name), origin));

const types = catalog.agents.map((agent) => agent.name).toSorted();

/** The agents whose start the settings hook would run for, by the agent type each one reports. */
function startsFor(matcher: string | undefined): readonly string[] {
  return catalog.agents
    .filter((agent) => {
      const registered = entry('SubagentStart', {
        handler: command('./scripts/setup-db-connection.sh'),
        ...(matcher === undefined ? {} : { matcher }),
      });
      const facts = { ...FACTS.SubagentStart, agent_type: agent.name };
      return select([registered], 'SubagentStart', facts).selected.length === 1;
    })
    .map((agent) => agent.name)
    .toSorted();
}

spec('agents.behavior.Project-level hooks for subagent events', () => {
  test('the docs example: a matcher "db-agent" runs the setup script for that subagent only', () => {
    expect(startsFor('db-agent')).toEqual(['db-agent']);
  });

  test('a matcher for the project subagent name does not match the plugin agent of that name', () => {
    expect(startsFor('db-agent')).not.toContain('my-plugin:db-agent');
  });

  test('the name is the frontmatter name, not the file name', () => {
    expect(startsFor('database')).toEqual([]);
  });

  test('a SubagentStop hook without a matcher runs when any subagent stops', () => {
    for (const agent of catalog.agents) {
      const stop = entry('SubagentStop', {
        handler: command('./scripts/cleanup-db-connection.sh'),
      });
      const facts = { ...FACTS.SubagentStop, agent_type: agent.name };
      expect(select([stop], 'SubagentStop', facts).selected).toHaveLength(1);
    }
    expect(startsFor(undefined)).toEqual(types);
  });

  test('a plugin subagent is matched by its scoped name: the colon makes it an unanchored regular expression', () => {
    expect(startsFor('my-plugin:db-agent')).toEqual(['my-plugin:db-agent', 'my-plugin:db-agent-2']);
  });

  test('anchored with ^ and $ it matches only that agent', () => {
    expect(startsFor('^my-plugin:db-agent$')).toEqual(['my-plugin:db-agent']);
  });

  test('the type a hook receives is the plain name for a managed, flag, project, user agent and the scoped name for a plugin agent', () => {
    const [flagged] = readFlagAgents({ flagged: { description: 'd', prompt: '' } }).agents;
    if (flagged === undefined) throw new Error('the flag agent did not load');
    const cases = [
      [read('policy', { source: 'managed', path: '/m/policy.md' }), 'policy'],
      [flagged, 'flagged'],
      [read('ship', { source: 'project', path: '/p/ship.md' }), 'ship'],
      [read('mine', { source: 'user', path: '/u/mine.md' }), 'mine'],
      [
        read('helper', {
          source: 'plugin',
          path: '/x/agents/review/helper.md',
          plugin: { name: 'my-plugin', relativePath: 'review/helper.md' },
        }),
        'my-plugin:review:helper',
      ],
    ] as const;
    for (const [record, type] of cases) {
      expect(hookAgentType(record)).toBe(type);
      expect(catalogAgentOf(record).name).toBe(type);
    }
  });

  test('a built-in is matched by its name', () => {
    expect(startsFor('Explore|Plan')).toEqual(['Explore', 'Plan']);
  });
});
