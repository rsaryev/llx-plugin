/**
 * Two plugins given under one id (docs/API.md, "Host and sessions"): the id names a plugin's hooks,
 * its options and its `enabledPlugins` row, so the host keeps the first and reports the other.
 * Integration tests of the host, outside `spec()`.
 */
import { describe, expect, test } from 'bun:test';
import { hostOf, loaded } from '../support/host.ts';

const json = (value: unknown): string => JSON.stringify(value);

describe('plugin ids of a host', () => {
  test('a second plugin with an id already given is dropped with an error', async () => {
    const first = await loaded({ '.claude-plugin/plugin.json': json({ name: 'ops' }) });
    const second = await loaded({ '.claude-plugin/plugin.json': json({ name: 'ops-two' }) });
    const { host } = await hostOf({
      plugins: [
        { id: 'ops@acme', plugin: first },
        { id: 'ops@acme', plugin: second },
      ],
    });
    expect(host.plugins.map((plugin) => plugin.name)).toEqual(['ops']);
    expect(host.issues).toEqual([
      {
        severity: 'error',
        path: 'ops@acme',
        message: 'A plugin with this id was given before: this one is not loaded',
      },
    ]);
  });
});
