/**
 * plugins/loading.md § Find where a plugin came from (a `--plugin-dir` plugin, `<name>@inline`, "loads
 * for that session only"; on "unless the manifest sets `defaultEnabled: false` or a settings file sets
 * `"<name>@inline": false`") and § Name conflicts (managed, then session-only, then installed, by
 * manifest name). plugins/install.md § Choose an install scope: a project or local install belongs to
 * one project. A session's own plugins (`SessionOptions.plugins`) are those: that they join the
 * host's for that session only, and that one under a host plugin's id replaces it there, are
 * judgments (spec/judgments.md), tested outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { createPolicyView } from '../../src/settings/index.ts';
import { hostOf, SESSION } from '../support/host.ts';
import { hostPlugin, pluginOf, skillText } from '../support/host-update.ts';
import { layerOf } from '../support/settings-layers.ts';
import { spec } from '../support/spec.ts';

const withSkill = (name: string, text: string) =>
  pluginOf(name, { skills: { go: skillText(text) } });

const skillTexts = (session: {
  skills(): { menu: readonly { name: string; description?: string }[] };
}) => session.skills().menu.map((entry) => `${entry.name}=${entry.description ?? ''}`);

const host = async () =>
  hostOf({ plugins: [hostPlugin('hello@market', await withSkill('hello', 'installed'))] });

spec('install.loading.Name conflicts', () => {
  test("a session's --plugin-dir plugin replaces the installed plugin of its manifest name in that session", async () => {
    const { host: shared } = await host();
    const own = shared.openSession({
      ...SESSION,
      plugins: [hostPlugin('hello@inline', await withSkill('hello', 'session copy'))],
    });
    const other = shared.openSession({ ...SESSION, sessionId: 'sess-2' });
    expect(skillTexts(own)).toEqual(['hello:go=session copy']);
    expect(own.plugins.map((each) => [each.id, each.enabled])).toEqual([
      ['hello@market', false],
      ['hello@inline', true],
    ]);
    expect(skillTexts(other)).toEqual(['hello:go=installed']);
    expect(shared.plugins.map((each) => each.id)).toEqual(['hello@market']);
  });

  test('a plugin id in managed enabledPlugins keeps the session copy of its name out, with the documented line', async () => {
    const { host: shared } = await hostOf({
      plugins: [hostPlugin('hello@market', await withSkill('hello', 'installed'))],
      settings: createPolicyView([
        layerOf('managed', { enabledPlugins: { 'hello@market': true } }),
      ]),
    });
    const own = shared.openSession({
      ...SESSION,
      plugins: [hostPlugin('hello@inline', await withSkill('hello', 'session copy'))],
    });
    expect(skillTexts(own)).toEqual(['hello:go=installed']);
    expect(own.issues.map((each) => each.message)).toContain(
      '--plugin-dir copy of "hello" ignored: plugin is locked by managed settings',
    );
  });
});

spec('install.loading.Keep a session-only plugin from loading', () => {
  test('a settings entry "<name>@inline": false turns the session copy off, so the installed copy loads', async () => {
    const { host: shared } = await host();
    const own = shared.openSession({
      ...SESSION,
      settings: createPolicyView([layerOf('user', { enabledPlugins: { 'hello@inline': false } })]),
      plugins: [hostPlugin('hello@inline', await withSkill('hello', 'session copy'))],
    });
    expect(skillTexts(own)).toEqual(['hello:go=installed']);
  });
});

describe("judgment: a session's own plugins join the host's for that session only", () => {
  test('two sessions each run their own project plugin under the same bare id', async () => {
    const { host: shared } = await hostOf({ plugins: [] });
    const a = shared.openSession({
      ...SESSION,
      plugins: [hostPlugin('tools@project', await withSkill('tools', 'project a'))],
    });
    const b = shared.openSession({
      ...SESSION,
      sessionId: 'sess-2',
      plugins: [hostPlugin('tools@project', await withSkill('tools', 'project b'))],
    });
    expect(skillTexts(a)).toEqual(['tools:go=project a']);
    expect(skillTexts(b)).toEqual(['tools:go=project b']);
    expect(shared.plugins).toEqual([]);
  });

  test("a session plugin under a host plugin's id replaces it in that session, without an issue", async () => {
    const { host: shared } = await host();
    const own = shared.openSession({
      ...SESSION,
      plugins: [hostPlugin('hello@market', await withSkill('hello', 'project install'))],
    });
    expect(skillTexts(own)).toEqual(['hello:go=project install']);
    expect(own.plugins.map((each) => each.id)).toEqual(['hello@market']);
    expect(own.issues).toEqual([]);
  });

  test('a plugin the host is given later reaches the session; its own plugins stay', async () => {
    const { host: shared } = await hostOf({ plugins: [] });
    const own = shared.openSession({
      ...SESSION,
      plugins: [hostPlugin('tools@project', await withSkill('tools', 'project'))],
    });
    shared.update({ plugins: [hostPlugin('hello@market', await withSkill('hello', 'user'))] });
    expect(skillTexts(own)).toEqual(['hello:go=user', 'tools:go=project']);
  });
});
