/**
 * plugins/loading.md § Paths that escape the plugin directory: a component path whose link leads
 * outside the plugin "doesn't load". The hooks module and the `types` file are component paths of a
 * mod, so they are read through the same containment check as every other one (judgment, the mod
 * paths row of spec/judgments.md).
 */
import { expect, test } from 'bun:test';
import { inline, registerOf, session } from '../../support/mods-load.ts';
import { memoryFiles } from '../../support/ports.ts';
import { moduleText } from '../../../src/testing/mods/index.ts';

const noop = registerOf(() => undefined);
const MANIFEST = (extra: object = {}) =>
  JSON.stringify({ name: 'linked', version: '0.1.0', ...extra });
const HOOKS = JSON.stringify({ modules: ['./register.js'] });

test('a hooks module whose link leads outside the plugin does not load, and says why', async () => {
  const files = memoryFiles({
    '.claude-plugin/plugin.json': MANIFEST(),
    'hooks/hooks.json': HOOKS,
    'hooks/register.js': { symlink: '../elsewhere/register.js' },
  });
  const { host } = session({ linked: noop });
  const report = await host.load([{ candidate: inline('linked'), files }]);
  expect(report.loaded).toEqual([]);
  expect(report.lines).toEqual([
    'linked: hooks module did not load: hooks path escapes plugin directory: hooks/register.js — it resolves to ../elsewhere/register.js, outside the plugin directory',
  ]);
});

test('a types file whose folder is a link outside the plugin is not read', async () => {
  const files = memoryFiles({
    '.claude-plugin/plugin.json': MANIFEST({ types: './types/state.d.ts' }),
    'hooks/hooks.json': HOOKS,
    'hooks/register.js': moduleText(noop),
    types: { symlink: '../shared-types' },
  });
  const { host } = session({ linked: noop });
  const report = await host.load([{ candidate: inline('linked'), files }]);
  expect(report.lines).toEqual([
    'linked: hooks module did not load: types path escapes plugin directory: ./types/state.d.ts — it resolves to ../shared-types/state.d.ts, outside the plugin directory',
  ]);
});
