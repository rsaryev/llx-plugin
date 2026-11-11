/**
 * A plugin's workflows in the session: workflows.md § Distribute a workflow in a plugin ("A plugin
 * called `acme-tools` containing a script whose `meta.name` is `release-audit` runs as
 * `/acme-tools:release-audit`"), § Turn workflows off ("the workflow commands ... are unavailable").
 * Where they stand among the skills, which one a shared name keeps, and the model listing are
 * judgments from oracle 2.1.319 (spec/judgments.md), tested outside spec().
 */
import { describe, expect, test } from 'bun:test';
import { createPolicyView } from '../../src/settings/index.ts';
import { hostOf, loaded, SESSION, signal } from '../support/host.ts';
import { layerOf } from '../support/settings-layers.ts';
import { spec } from '../support/spec.ts';

const flow = (name: string, description = `${name} flow`) =>
  `export const meta = { name: '${name}', description: '${description}' }\nawait agent('go')\n`;
const skill = (description: string) => `---\ndescription: ${description}\n---\nDo it.\n`;

async function sessionOf(
  tree: Record<string, string>,
  fixture: Omit<Parameters<typeof hostOf>[0] & object, 'plugins'> = {},
) {
  const plugin = await loaded({ '.claude-plugin/plugin.json': '{"name":"acme-tools"}', ...tree });
  const { host } = await hostOf({ ...fixture, plugins: [{ id: 'acme-tools@acme', plugin }] });
  return host.openSession(SESSION);
}

const menu = (session: Awaited<ReturnType<typeof sessionOf>>) =>
  session.skills().menu.map((row) => row.name);

spec('workflows.behavior.Distribute a workflow in a plugin', () => {
  test('a script whose meta.name is release-audit is /acme-tools:release-audit in the menu', async () => {
    const session = await sessionOf({ 'workflows/audit.js': flow('release-audit') });
    expect(session.skills().menu).toEqual([
      { name: 'acme-tools:release-audit', description: 'release-audit flow', argumentHint: '' },
    ]);
    expect(session.skills().workflows).toEqual([
      {
        name: 'acme-tools:release-audit',
        description: 'release-audit flow',
        pluginId: 'acme-tools@acme',
        path: 'workflows/audit.js',
      },
    ]);
  });
});

spec('workflows.behavior.Turn workflows off', () => {
  test('with disableWorkflows the workflow commands are unavailable; the skills stay', async () => {
    const settings = createPolicyView([layerOf('user', { disableWorkflows: true })]);
    const tree = { 'workflows/a.js': flow('audit'), 'skills/s/SKILL.md': skill('A skill') };
    const session = await sessionOf(tree, { settings });
    expect(menu(session)).toEqual(['acme-tools:s']);
    expect(session.skills().workflows).toEqual([]);
    expect(session.skills().model.entries.map((entry) => entry.name)).toEqual(['acme-tools:s']);
  });

  test('CLAUDE_CODE_DISABLE_WORKFLOWS=1 and a Pro plan without enableWorkflows turn them off too', async () => {
    const tree = { 'workflows/a.js': flow('audit') };
    const byEnv = await sessionOf(tree, { env: { CLAUDE_CODE_DISABLE_WORKFLOWS: '1' } });
    const byPlan = await sessionOf(tree, { workflows: { plan: { pro: true } } });
    expect(menu(byEnv)).toEqual([]);
    expect(menu(byPlan)).toEqual([]);
  });
});

describe('plugin workflows among the skills (judgments: spec/judgments.md, oracle 2.1.319)', () => {
  test('the model is told about a workflow first, with its meta description', async () => {
    const session = await sessionOf({
      'skills/s/SKILL.md': skill('A skill'),
      'workflows/a.js': flow('audit', 'Audit <routes>'),
    });
    expect(session.skills().model.entries).toEqual([
      { name: 'acme-tools:audit', description: 'Audit &lt;routes&gt;' },
      { name: 'acme-tools:s', description: 'A skill' },
    ]);
    expect(menu(session)).toEqual(['acme-tools:audit', 'acme-tools:s']);
  });

  test('a workflow keeps a name a skill or a command of the plugin also has', async () => {
    const session = await sessionOf({
      'skills/audit/SKILL.md': skill('The skill'),
      'commands/audit.md': skill('The command'),
      'workflows/a.js': flow('audit', 'The workflow'),
    });
    expect(session.skills().menu).toEqual([
      { name: 'acme-tools:audit', description: 'The workflow', argumentHint: '' },
    ]);
    const expansion = await session.expandSkill('acme-tools:audit', { signal: signal() });
    expect(expansion.ok).toBe(false);
  });

  test('two scripts with one meta.name: the first in the folder listing runs', async () => {
    const session = await sessionOf({
      'workflows/a.js': flow('audit', 'first'),
      'workflows/b.js': flow('audit', 'second'),
    });
    expect(session.skills().workflows.map((row) => row.description)).toEqual(['first']);
  });

  test('a script without a readable meta, or without a description, is not a command', async () => {
    const session = await sessionOf({
      'workflows/late.js': `const x = 1\n${flow('late')}`,
      'workflows/bare.js': "export const meta = { name: 'bare' }\nawait agent('go')\n",
    });
    expect(menu(session)).toEqual([]);
  });
});
