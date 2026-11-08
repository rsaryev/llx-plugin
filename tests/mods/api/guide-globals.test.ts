/** plugins/mods/api.md § Reach files, processes, and the network: Web APIs, not Node imports. */
import { expect, test } from 'bun:test';
import type { ModNext, ModsApi } from '../../../src/mods/types.ts';
import { installed, modPlugin, registerOf, session } from '../../support/mods-load.ts';
import { spec } from '../../support/spec.ts';

type Next = ModNext<unknown, Promise<unknown>>;
const register = registerOf((on) => {
  on('session.start', async (_$: ModsApi, e: unknown, next: Next) => {
    await next(e);
    return {
      url: new URL('https://example.test/path').hostname,
      decoded: new TextDecoder().decode(new TextEncoder().encode('hello')),
      aborted: new AbortController().signal.aborted,
      crypto: typeof crypto,
      date: typeof Date,
    };
  });
});

spec('mods.apiGuide.Reach files, processes, and the network', () => {
  test('a compiled and loaded hook can use deterministic standard JavaScript and Web APIs', async () => {
    const s = session({ web: register }, { firesSessionStart: false });
    const report = await s.host.load([modPlugin(installed('web'), register)]);
    expect(report.loaded.some((mod) => mod.name === 'web')).toBe(true);
    expect(await s.host.fire('session.start', {})).toEqual({
      url: 'example.test',
      decoded: 'hello',
      aborted: false,
      crypto: 'object',
      date: 'function',
    });
  });

  test('a hook module importing a Node builtin is refused, not evaluated with host privileges', async () => {
    const s = session({ bad: register }, { firesSessionStart: false });
    const report = await s.host.load([
      modPlugin(installed('bad'), register, {
        'hooks/register.js':
          'import fs from "node:fs"; export function register(on) { on("session.start", () => fs.readFileSync("/private")); }',
      }),
    ]);
    expect(report.loaded.some((mod) => mod.name === 'bad')).toBe(false);
    expect(report.lines.length).toBeGreaterThan(0);
  });
});
