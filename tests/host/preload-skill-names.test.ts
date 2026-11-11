/**
 * Which skill a bare name in an agent's `skills` field preloads. sub-agents.md, "Preload skills into
 * subagents", says only that the listed skills' full content is injected and that a missing or
 * disabled one is skipped; skills.md, "How a skill gets its command name", names a plugin skill
 * `/plugin-name:skill-name`. How a bare name finds a plugin skill is oracle 2.1.322 (spec/judgments.md),
 * a black-box probe: `claude -p --plugin-dir …` with a private HOME and config folder and a local fake
 * Messages API that answers the first turn with an `Agent` call, the subagent's request read for
 * each skill body. Observed: an exact name Claude can invoke wins (a project or user `greet` over
 * `alpha:greet`); else the agent's own plugin's `alpha:greet`, whatever the plugin order; else the
 * first plugin, in load order, with a skill `<plugin>:greet` Claude can invoke; a user or project
 * agent takes the first and the last steps. A qualified name is exact. Tested outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import type { CatalogSource } from '../../src/agents/catalog/index.ts';
import type { HostPlugin } from '../../src/host/index.ts';
import { loaded, signal } from '../support/host.ts';
import { HOME, PROJECT, folderHostOf } from '../support/scan.ts';

const skill = (mark: string, extra = '') => `---\ndescription: d\n${extra}---\nBODY ${mark}`;

async function pluginOf(
  name: string,
  skills: Record<string, string>,
  agentSkills?: readonly string[],
): Promise<HostPlugin> {
  const files: Record<string, string> = {
    '.claude-plugin/plugin.json': JSON.stringify({ name }),
    ...Object.fromEntries(
      Object.entries(skills).map(([folder, text]) => [`skills/${folder}/SKILL.md`, text]),
    ),
  };
  if (agentSkills !== undefined) {
    const list = agentSkills.map((each) => `  - ${each}`).join('\n');
    files['agents/helper.md'] = `---\nname: helper\ndescription: h\nskills:\n${list}\n---\nAGENT`;
  }
  return { id: `${name}@market`, plugin: await loaded(files) };
}

async function preloadedBy(
  plugins: readonly HostPlugin[],
  agent: string,
  files: Record<string, string> = {},
): Promise<readonly string[]> {
  const { session } = folderHostOf(files, { plugins });
  await session.reloadSkills({ signal: signal() });
  await session.reloadAgents({ signal: signal() });
  const row = session.agentCatalog().agents.find((each) => each.name === agent);
  if (row === undefined) throw new Error(`no agent ${agent}`);
  const { preloaded } = await session.preloadSkills(row.definition, {
    signal: signal(),
    source: row.source,
  });
  return preloaded.map((each) => each.body);
}

const projectAgent = (skills: readonly string[]) => ({
  [`${PROJECT}/.claude/agents/helper.md`]: `---\nname: helper\ndescription: h\nskills:\n${skills
    .map((each) => `  - ${each}`)
    .join('\n')}\n---\nAGENT`,
});

describe('a bare name in a plugin agent (oracle 2.1.322)', () => {
  test("finds the agent's own plugin skill, which keeps its folder name", async () => {
    const alpha = await pluginOf('alpha', { greet: skill('ALPHA') }, ['greet']);
    expect(await preloadedBy([alpha], 'alpha:helper')).toEqual(['BODY ALPHA']);
  });

  test('prefers the own plugin over another plugin, whichever loaded first', async () => {
    const alpha = await pluginOf('alpha', { greet: skill('ALPHA') }, ['greet']);
    const beta = await pluginOf('beta', { greet: skill('BETA') });
    expect(await preloadedBy([beta, alpha], 'alpha:helper')).toEqual(['BODY ALPHA']);
    expect(await preloadedBy([alpha, beta], 'alpha:helper')).toEqual(['BODY ALPHA']);
  });

  test('an exact project or user skill wins over the own plugin', async () => {
    const alpha = await pluginOf('alpha', { greet: skill('ALPHA') }, ['greet']);
    const project = { [`${PROJECT}/.claude/skills/greet/SKILL.md`]: skill('PROJECT') };
    expect(await preloadedBy([alpha], 'alpha:helper', project)).toEqual(['BODY PROJECT']);
    const user = { [`${HOME}/.claude/skills/greet/SKILL.md`]: skill('USER') };
    expect(await preloadedBy([alpha], 'alpha:helper', user)).toEqual(['BODY USER']);
  });

  test('an exact skill Claude cannot invoke gives way to the plugin skill', async () => {
    const alpha = await pluginOf('alpha', { greet: skill('ALPHA') }, ['greet']);
    const project = {
      [`${PROJECT}/.claude/skills/greet/SKILL.md`]: skill(
        'PROJECT',
        'disable-model-invocation: true\n',
      ),
    };
    expect(await preloadedBy([alpha], 'alpha:helper', project)).toEqual(['BODY ALPHA']);
  });

  test('without an own skill, the first plugin that has one', async () => {
    const alpha = await pluginOf('alpha', { other: skill('OTHER') }, ['greet']);
    const beta = await pluginOf('beta', { greet: skill('BETA') });
    const gamma = await pluginOf('gamma', { greet: skill('GAMMA') });
    expect(await preloadedBy([alpha, beta, gamma], 'alpha:helper')).toEqual(['BODY BETA']);
    const own = await pluginOf(
      'alpha',
      { greet: skill('ALPHA', 'disable-model-invocation: true\n') },
      ['greet'],
    );
    expect(await preloadedBy([own, beta], 'alpha:helper')).toEqual(['BODY BETA']);
  });

  test('a qualified name is exact, of any plugin', async () => {
    const alpha = await pluginOf('alpha', { greet: skill('ALPHA') }, ['alpha:greet', 'beta:greet']);
    const beta = await pluginOf('beta', { greet: skill('BETA') });
    expect(await preloadedBy([alpha, beta], 'alpha:helper')).toEqual(['BODY ALPHA', 'BODY BETA']);
  });
});

describe('a bare name in a project agent (oracle 2.1.322)', () => {
  test('finds the first plugin, in load order, with that skill', async () => {
    const alpha = await pluginOf('alpha', { greet: skill('ALPHA') });
    const beta = await pluginOf('beta', { greet: skill('BETA') });
    expect(await preloadedBy([alpha, beta], 'helper', projectAgent(['greet']))).toEqual([
      'BODY ALPHA',
    ]);
    expect(await preloadedBy([beta, alpha], 'helper', projectAgent(['greet']))).toEqual([
      'BODY BETA',
    ]);
  });

  test('without a source, a plugin agent is read as one of no plugin', async () => {
    const alpha = await pluginOf('alpha', { greet: skill('ALPHA') }, ['greet']);
    const beta = await pluginOf('beta', { greet: skill('BETA') });
    const { session } = folderHostOf({}, { plugins: [beta, alpha] });
    const none: CatalogSource = { kind: 'flag' };
    const read = await session.preloadSkills({ skills: ['greet'] }, { signal: signal() });
    const flagged = await session.preloadSkills(
      { skills: ['greet'] },
      { signal: signal(), source: none },
    );
    expect(read.preloaded.map((each) => each.body)).toEqual(['BODY BETA']);
    expect(flagged.preloaded.map((each) => each.body)).toEqual(['BODY BETA']);
  });
});
