/**
 * Which skill an agent's `skills` entry preloads when a plugin skill's frontmatter `name` differs
 * from its folder. skills.md, "How a skill gets its command name": in a plugin skill "`name` sets
 * the last segment of the command and the plugin prefix stays in place", and "the bare `/fancy`
 * also invokes the skill". sub-agents.md, "Preload skills into subagents", does not say which names a
 * `skills` entry takes. Oracle 2.1.322 (spec/judgments.md), a black-box probe: `claude -p
 * --plugin-dir …` with a private HOME and config folder and a local fake Messages API that answers
 * the first turn with an `Agent` call, the subagent's request read for the skill body. A plugin
 * `alpha` with `skills/greet/SKILL.md` saying `name: fancy`: each of `fancy`, `alpha:fancy`, `greet`
 * and `alpha:greet` preloads it, for a plugin agent and for a project agent alike; `nothing` and
 * `alpha:nothing` preload nothing. The same names invoke it: `claude -p '/alpha:fancy'`, `'/fancy'`
 * and `'/alpha:greet'` each send its body, while `init.slash_commands` lists only `alpha:greet`
 * (`Skill.declaredCommand`). Tested outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import type { HostPlugin } from '../../src/host/index.ts';
import { loaded, signal } from '../support/host.ts';
import { PROJECT, folderHostOf } from '../support/scan.ts';

const agentFile = (names: readonly string[]) =>
  `---\nname: helper\ndescription: h\nskills:\n${names.map((each) => `  - ${each}`).join('\n')}\n---\nAGENT`;

async function alpha(agentSkills?: readonly string[]): Promise<HostPlugin> {
  const files: Record<string, string> = {
    '.claude-plugin/plugin.json': JSON.stringify({ name: 'alpha' }),
    'skills/greet/SKILL.md': '---\nname: fancy\ndescription: d\n---\nBODY FANCY',
  };
  if (agentSkills !== undefined) files['agents/helper.md'] = agentFile(agentSkills);
  return { id: 'alpha@market', plugin: await loaded(files) };
}

async function preloaded(
  plugin: HostPlugin,
  agent: string,
  files: Record<string, string> = {},
): Promise<{ bodies: readonly string[]; skipped: readonly string[] }> {
  const { session } = folderHostOf(files, { plugins: [plugin] });
  await session.reloadSkills({ signal: signal() });
  await session.reloadAgents({ signal: signal() });
  const row = session.agentCatalog().agents.find((each) => each.name === agent);
  if (row === undefined) throw new Error(`no agent ${agent}`);
  const plan = await session.preloadSkills(row.definition, {
    signal: signal(),
    source: row.source,
  });
  return {
    bodies: plan.preloaded.map((each) => each.body),
    skipped: plan.skipped.map((each) => each.name),
  };
}

const NAMES = ['fancy', 'alpha:fancy', 'greet', 'alpha:greet'];

describe('a plugin skill whose frontmatter name differs from its folder (oracle 2.1.322)', () => {
  for (const name of NAMES) {
    test(`a plugin agent's \`${name}\` preloads it`, async () => {
      expect(await preloaded(await alpha([name]), 'alpha:helper')).toEqual({
        bodies: ['BODY FANCY'],
        skipped: [],
      });
    });

    test(`a project agent's \`${name}\` preloads it`, async () => {
      const project = { [`${PROJECT}/.claude/agents/helper.md`]: agentFile([name]) };
      expect(await preloaded(await alpha(), 'helper', project)).toEqual({
        bodies: ['BODY FANCY'],
        skipped: [],
      });
    });
  }

  test('a name it does not answer to preloads nothing', async () => {
    const result = await preloaded(await alpha(['nothing', 'alpha:nothing']), 'alpha:helper');
    expect(result).toEqual({ bodies: [], skipped: ['nothing', 'alpha:nothing'] });
  });
});

describe('the same names invoke it (oracle 2.1.322)', () => {
  for (const name of ['alpha:greet', 'alpha:fancy', 'fancy']) {
    test(`\`/${name}\` runs it, listed as \`alpha:greet\``, async () => {
      const { session } = folderHostOf({}, { plugins: [await alpha()] });
      await session.reloadSkills({ signal: signal() });
      const expansion = await session.expandSkill(name, { signal: signal() });
      expect(expansion.ok && expansion.text).toContain('BODY FANCY');
      expect(session.skillCatalog().skills.map((row) => row.invocable.command)).toEqual([
        'alpha:greet',
      ]);
    });
  }
});
