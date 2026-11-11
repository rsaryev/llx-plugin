/**
 * What a session registers from a plugin where Claude Code 2.1.319 decides and the docs say less or
 * differently (E5a; spec/judgments.md, "oracle 2.1.319"; docs/SPEC.md). Each test is the smallest
 * plugin of its own that shows one rule; the same shapes are the fixtures of tests/fixtures/runtime,
 * checked against the oracle's recorded result by runtime-oracle.test.ts. Outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { createPolicyView, readSettingsLayer } from '../../src/settings/index.ts';
import { hostOf, loaded, SESSION } from '../support/host.ts';

const json = JSON.stringify;
const md = (fields: Record<string, string>, body = 'Body.') =>
  `---\n${Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')}\n---\n${body}\n`;
const manifest = (extra: object = {}) => json({ name: 'plug', ...extra });

const session = async (files: Record<string, string>, settings?: unknown) => {
  const plugin = await loaded(files);
  const view =
    settings === undefined
      ? undefined
      : createPolicyView([readSettingsLayer('user', settings).layer]);
  const { host } = await hostOf({
    plugins: [{ id: `${plugin.name}@inline`, plugin }],
    ...(view === undefined ? {} : { settings: view }),
  });
  return host.openSession(SESSION);
};

const skill = (name?: string) => md({ ...(name ? { name } : {}), description: 'd' });

describe('a skill is named by its folder where a scan finds it', () => {
  test('skills/<folder>/ keeps the folder name whatever `name` says', async () => {
    const { menu } = (
      await session({
        '.claude-plugin/plugin.json': manifest(),
        'skills/folder-a/SKILL.md': skill('declared'),
      })
    ).skills();
    expect(menu.map((entry) => entry.name)).toEqual(['plug:folder-a']);
  });

  test('a folder of skills a manifest path lists is scanned the same way', async () => {
    const { menu } = (
      await session({
        '.claude-plugin/plugin.json': manifest({ skills: ['./more'] }),
        'more/three/SKILL.md': skill('declared-three'),
      })
    ).skills();
    expect(menu.map((entry) => entry.name)).toEqual(['plug:three']);
  });

  test('a folder a manifest path names itself, and the plugin-root SKILL.md, use `name`', async () => {
    const named = await session({
      '.claude-plugin/plugin.json': manifest({ skills: ['./extra/one'] }),
      'extra/one/SKILL.md': skill('declared-one'),
    });
    expect(named.skills().menu.map((entry) => entry.name)).toEqual(['plug:declared-one']);
    const root = await session({
      '.claude-plugin/plugin.json': manifest(),
      'SKILL.md': skill('root-skill'),
    });
    expect(root.skills().menu.map((entry) => entry.name)).toEqual(['plug:root-skill']);
  });
});

const dualFiles = (commandFields: Record<string, string>) => ({
  '.claude-plugin/plugin.json': manifest(),
  'skills/dual/SKILL.md': md({ description: 'From the skill.' }),
  'commands/dual.md': md({ description: 'From the command.', ...commandFields }),
});

describe('one registration per name', () => {
  test('two agents that declare the same name register once, the first in loading order', async () => {
    const agents = await (
      await session({
        '.claude-plugin/plugin.json': manifest(),
        'agents/a.md': md({ name: 'same', description: 'First.' }),
        'agents/b.md': md({ name: 'same', description: 'Second.' }),
        'agents/sub/c.md': md({ name: 'same', description: 'Nested.' }),
      })
    ).agents({ builtin: false });
    expect(agents.resolved.map((agent) => [agent.name, agent.definition.description])).toEqual([
      ['plug:same', 'First.'],
      ['plug:sub:same', 'Nested.'],
    ]);
  });

  test('a skill and a command of one name are one menu entry, the command', async () => {
    const plain = (await session(dualFiles({}))).skills();
    expect(plain.menu).toEqual([
      { name: 'plug:dual', description: 'From the command.', argumentHint: '' },
    ]);
    expect(plain.model.entries.map((entry) => entry.name)).toEqual(['plug:dual']);
    const hidden = (await session(dualFiles({ 'user-invocable': 'false' }))).skills();
    expect(hidden.menu).toEqual([]);
  });
});

describe('defaultEnabled: false (plugins/loading.md, "@inline")', () => {
  const files = {
    '.claude-plugin/plugin.json': manifest({ defaultEnabled: false }),
    'skills/dormant/SKILL.md': md({ description: 'd' }),
  };

  test('an inline plugin starts off, and registers nothing', async () => {
    expect((await session(files)).skills().menu).toEqual([]);
  });

  test('a settings entry for it turns it on', async () => {
    const on = await session(files, { enabledPlugins: { 'plug@inline': true } });
    expect(on.skills().menu.map((entry) => entry.name)).toEqual(['plug:dormant']);
  });
});
