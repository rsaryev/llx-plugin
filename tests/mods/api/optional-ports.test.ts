/**
 * The ports a host may leave out of `createModsHost` because the declarations (AGENTS.md, E2a) say
 * what the call does where the capability is missing (claude-code/index.d.ts, declarations 2.1.321):
 * - `$.audio.play` (:2814): "a Linux or Windows terminal, having no player, plays nothing. Resolves
 *   once played or skipped"; `$.audio.speak` (:2828): "rejects, naming the cause, when there is no
 *   synthesizer".
 * - `$.mcp.call` (:2849) calls "one of the engine's connected MCP servers"; `$.mcp.connect` (:2869)
 *   answers "connected, ... or why not".
 * - `$.theme.set` (:2711): "`isDrawn: false` and why"; `ThemeResult` (:14078) "nothing draws the
 *   backdrop now, for the `reason` given".
 * - `$.telemetry.log` and `.mark` (:3331, :3348): "The engine does nothing with it": the built-in
 *   plugins that hook the event queue the row.
 */
import { describe, expect, test } from 'bun:test';
import {
  OPTIONAL_PORT_DEFAULTS,
  withDefaultPorts,
  type ModHostPorts,
  type ModHostPortsInput,
} from '../../../src/mods/api/index.ts';
import { fakePorts } from '../../../src/testing/mods/index.ts';
import { apiHarness } from '../../support/mods-api.ts';
import { rejection } from '../../support/rejection.ts';

const absent = () =>
  apiHarness({ ports: OPTIONAL_PORT_DEFAULTS, options: { ownMcpServers: () => ['browser'] } });

describe('a host without the optional ports gets the declared answers', () => {
  test('$.audio.play resolves, skipped; $.audio.speak rejects naming the missing synthesizer', async () => {
    const h = await absent();
    expect(await h.api.audio.play({ asset: 'sounds/done.wav' })).toBeUndefined();
    expect(await rejection(h.api.audio.speak('done'))).toBe(
      '$.audio.speak: there is no synthesizer',
    );
  });

  test('$.mcp.call rejects as for a server that is not connected; $.mcp.connect says it is not', async () => {
    const h = await absent();
    expect(await rejection(h.api.mcp.call('gmail', 'send'))).toBe(
      '$.mcp.call: MCP server "gmail" is not connected',
    );
    expect(await h.api.mcp.connect('browser')).toEqual({
      isConnected: false,
      reason: 'failed',
      message: 'MCP server "browser" did not connect',
    });
  });

  test('$.theme.set resolves isDrawn false, with the reason', async () => {
    const h = await absent();
    expect(await h.api.theme.set({ backdrop: { id: 'lagoon' } })).toEqual({
      isDrawn: false,
      reason: 'no Desktop or mobile app that draws backdrops is connected to the session',
    });
  });

  test('$.telemetry.log and .mark resolve once the hooks have answered', async () => {
    const h = await absent();
    expect(await h.api.telemetry.log({ to: 'anthropic', event: 'x' })).toBeUndefined();
    expect(await h.api.telemetry.mark({ feature: 'f', kind: 'ok' })).toBeUndefined();
  });
});

describe('withDefaultPorts', () => {
  test('fills only the ports left out: a given one is kept', () => {
    const { ports } = fakePorts();
    const { audio, mcp, theme, telemetry, ...required } = ports;
    const input: ModHostPortsInput = { ...required, audio };
    const filled: ModHostPorts = withDefaultPorts(input);
    expect(filled.audio).toBe(audio);
    expect(filled.mcp).toBe(OPTIONAL_PORT_DEFAULTS.mcp);
    expect(filled.theme).toBe(OPTIONAL_PORT_DEFAULTS.theme);
    expect(filled.telemetry).toBe(OPTIONAL_PORT_DEFAULTS.telemetry);
    expect(filled.fs).toBe(ports.fs);
    expect([mcp, theme, telemetry].every(Boolean)).toBe(true);
  });
});
