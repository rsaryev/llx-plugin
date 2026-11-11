/**
 * managed-mcp.md § "When provided servers connect": through server-managed settings, "On a machine
 * with cached settings, Claude Code withholds the cached copy of this key until the server confirms
 * the settings for the session, and waits for that confirmation before it loads MCP servers. If the
 * confirmation fails, the session continues without the provided servers and `/status` says they are
 * withheld. On a machine's first launch, with nothing cached yet, an interactive session that starts
 * before the settings arrive connects the provided servers as soon as they do, and a `claude -p` run
 * that has already started can finish without them." With gateway sign-in "Claude Code loads the
 * policy before the session starts, so neither case delays or skips the provided servers". Running
 * interactive sessions: "Add a server: Claude Code connects it when the updated settings arrive,
 * without a restart"; "Change a server's entry: those sessions reconnect to it with the new
 * definition"; "Remove a server: a running interactive session disconnects it once it reads the
 * changed settings. A non-interactive (`-p`) run keeps it until it ends."
 */
import { describe, expect, test } from 'bun:test';
import { providedServersTiming, reconcileManagedServers } from '../../../src/settings/mcp/index.ts';
import { provided } from '../../support/mcp-managed.ts';
import { spec } from '../../support/spec.ts';

const serverManaged = { delivery: 'serverManaged', interactive: true } as const;

spec('mcpSettings.managed.When provided servers connect', () => {
  test("with cached settings the cached copy waits for the server's confirmation before any MCP server loads", () => {
    const timing = providedServersTiming({
      ...serverManaged,
      cached: true,
      confirmationFailed: false,
    });
    expect(timing.waitsForConfirmation).toBe(true);
    expect(timing.connectsAtStart).toBe(true);
    expect(timing.withheld).toBeUndefined();
  });

  test('if the confirmation fails the session continues without them and /status says they are withheld', () => {
    const timing = providedServersTiming({
      ...serverManaged,
      cached: true,
      confirmationFailed: true,
    });
    expect(timing.waitsForConfirmation).toBe(true);
    expect(timing.connectsAtStart).toBe(false);
    expect(timing.withheld).toContain('withheld');
  });

  test('on a first launch an interactive session connects them as soon as the settings arrive', () => {
    const timing = providedServersTiming({
      ...serverManaged,
      cached: false,
      confirmationFailed: false,
    });
    expect(timing).toMatchObject({
      waitsForConfirmation: false,
      connectsAtStart: false,
      connectsOnArrival: true,
      mayFinishWithout: false,
    });
  });

  test('on a first launch a `claude -p` run that has started can finish without them', () => {
    const timing = providedServersTiming({
      delivery: 'serverManaged',
      interactive: false,
      cached: false,
      confirmationFailed: false,
    });
    expect(timing).toMatchObject({ connectsOnArrival: false, mayFinishWithout: true });
  });

  test('with gateway sign-in neither case delays or skips them', () => {
    for (const interactive of [true, false]) {
      for (const cached of [true, false]) {
        const timing = providedServersTiming({
          delivery: 'gateway',
          interactive,
          cached,
          confirmationFailed: false,
        });
        expect(timing).toEqual({
          waitsForConfirmation: false,
          connectsAtStart: true,
          connectsOnArrival: false,
          mayFinishWithout: false,
          withheld: undefined,
        });
      }
    }
  });
});

const search = provided('search', 'https://search.example.com/mcp');
const records = provided('records', 'https://records.example.com/mcp');
const interactive = { interactive: true };

spec('mcpSettings.managed.When provided servers connect.Add a server', () => {
  test('a server that appears in the updated settings is connected, without a restart', () => {
    expect(reconcileManagedServers([search], [search, records], interactive)).toEqual({
      add: ['records'],
      change: [],
      remove: [],
    });
  });

  test('the first servers of an empty set are all added', () => {
    expect(reconcileManagedServers([], [search, records], interactive).add).toEqual([
      'search',
      'records',
    ]);
  });
});

spec(`mcpSettings.managed.When provided servers connect.Change a server's entry`, () => {
  test('a new definition reconnects the server: a changed URL, header or option', () => {
    const moved = provided('search', 'https://search2.example.com/mcp');
    expect(reconcileManagedServers([search, records], [moved, records], interactive)).toEqual({
      add: [],
      change: ['search'],
      remove: [],
    });
    const withHeader = { ...search, server: { ...search.server, headers: { 'X-Key': 'k' } } };
    expect(reconcileManagedServers([search], [withHeader], interactive).change).toEqual(['search']);
  });

  test('the same definition written in another key order is no change', () => {
    const a = {
      ...search,
      server: { type: 'http', url: 'https://x.example.com/', headers: { A: '1', B: '2' } },
    } as const;
    const b = {
      ...search,
      server: { headers: { B: '2', A: '1' }, url: 'https://x.example.com/', type: 'http' },
    } as const;
    expect(reconcileManagedServers([a], [b], interactive)).toEqual({
      add: [],
      change: [],
      remove: [],
    });
  });
});

spec('mcpSettings.managed.When provided servers connect.Remove a server', () => {
  test('a running interactive session disconnects it once it reads the changed settings', () => {
    expect(reconcileManagedServers([search, records], [records], interactive).remove).toEqual([
      'search',
    ]);
  });

  test('a non-interactive run keeps it until it ends', () => {
    expect(
      reconcileManagedServers([search, records], [records], { interactive: false }).remove,
    ).toEqual([]);
  });
});

describe('managed server timing judgments', () => {
  // Judgment (spec/judgments.md): the page says "Interactive sessions that are already running apply
  // your edits", so a `-p` run applies none of the three; the wording of the withheld status; a
  // device source (MDM, HKLM, managed-settings.json) is read before the session, like the gateway.
  test('a `-p` run applies no edit', () => {
    expect(reconcileManagedServers([search], [records], { interactive: false })).toEqual({
      add: [],
      change: [],
      remove: [],
    });
  });

  test('a device source is read before the session starts', () => {
    const timing = providedServersTiming({
      delivery: 'device',
      interactive: false,
      cached: false,
      confirmationFailed: false,
    });
    expect(timing.connectsAtStart).toBe(true);
    expect(timing.waitsForConfirmation).toBe(false);
  });

  test('the withheld status says why', () => {
    const timing = providedServersTiming({
      ...serverManaged,
      cached: true,
      confirmationFailed: true,
    });
    expect(timing.withheld).toBe(
      'Managed MCP servers are withheld: the server did not confirm the managed settings for this session',
    );
  });
});
