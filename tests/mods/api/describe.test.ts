/**
 * `describeApi(api)`: a kit judgment (spec/judgments.md). The docs publish the declarations of the
 * mods API (plugins/mods/reference.md § Mods API methods), not a function that describes them; a host
 * that runs mods in another realm needs the shape of `$` as plain data to rebuild it there. These tests
 * hold the description to the live `$` and to the table of the reference, so it cannot drift.
 */
import { describe, expect, test } from 'bun:test';
import { describeApi, type ApiMember } from '../../../src/mods/api/index.ts';
import { uiRules } from '../../../src/mods/ui/index.ts';
import { API_EVENT_NAMES } from '../../../src/protocol/mods-events.ts';
import { MODS_API } from '../../../src/protocol/mods-api-names.ts';
import { apiHarness } from '../../support/mods-api.ts';
import { fn, record } from '../../support/mods-chain.ts';
import { fakeInterface, uiOver } from '../../support/mods-ui.ts';

async function withUi() {
  const { iface } = fakeInterface();
  return apiHarness({ rules: uiRules, ui: uiOver(iface) });
}

const membersOf = (api: ReturnType<typeof describeApi>, namespace: string): readonly ApiMember[] =>
  api.find((entry) => entry.name === namespace)?.members ?? [];

/** Arguments each call that answers at once takes; the rest take a text. */
const SYNC_ARGUMENTS: Readonly<Record<string, readonly unknown[]>> = {
  resolve: [{ component: 'Pane', surface: 'terminal' }],
  invalidate: ['ui.render'],
  notice: ['toolu_1', 'x'],
};

describe('describeApi', () => {
  test('lists every namespace of the reference in its order, and in each exactly its members', async () => {
    const { api } = await withUi();
    const described = describeApi(api);
    expect(described.map((entry) => entry.name)).toEqual(Object.keys(MODS_API));
    for (const [namespace, methods] of Object.entries(MODS_API)) {
      expect(membersOf(described, namespace).map((member) => member.name)).toEqual([...methods]);
    }
  });

  test('a member that is a call names the event it fires; a value fires none', async () => {
    const { api } = await withUi();
    const described = describeApi(api);
    const events = described.flatMap((entry) =>
      entry.members.flatMap((member) => member.event ?? []),
    );
    expect(events.map(String).toSorted()).toEqual([...API_EVENT_NAMES].toSorted());
    expect(membersOf(described, 'plugin')).toEqual([
      { name: 'name', kind: 'value', async: false },
      { name: 'root', kind: 'value', async: false },
    ]);
    expect(membersOf(described, 'fs')[0]).toEqual({
      name: 'read',
      kind: 'call',
      async: true,
      event: 'fs.read',
    });
  });

  test('says which calls answer at once: the timers, ui.resolve, the calls declared void, and the stream of process.spawn', async () => {
    const { api } = await withUi();
    const kinds = Object.fromEntries(
      describeApi(api).flatMap((entry) =>
        entry.members
          .filter((member) => member.kind !== 'call' && member.kind !== 'value')
          .map((member) => [member.event, member.kind]),
      ),
    );
    expect(kinds).toEqual({
      'ui.resolve': 'sync',
      'ui.invalidate': 'sync',
      'ui.toast': 'sync',
      'ui.status': 'sync',
      'ui.log': 'sync',
      'ui.notice': 'sync',
      'clock.after': 'timer',
      'clock.every': 'timer',
      'process.spawn': 'stream',
    });
    const sync = membersOf(describeApi(api), 'ui').find((member) => member.name === 'resolve');
    expect(sync?.async).toBe(false);
  });

  test("marks the one call whose time is the hook's own: $.clock.sleep (claude-code/index.d.ts:3641)", async () => {
    const { api } = await withUi();
    const own = describeApi(api).flatMap((entry) =>
      entry.members.filter((member) => member.ownTime === true).map((member) => member.event),
    );
    expect(own).toEqual(['clock.sleep']);
  });

  test('is plain data: it survives a JSON round trip unchanged', async () => {
    const { api } = await withUi();
    const described = describeApi(api);
    expect(JSON.parse(JSON.stringify(described))).toEqual(described);
  });

  test('agrees with the live `$`: each kind is what the member does when called', async () => {
    const { api } = await withUi();
    for (const entry of describeApi(api)) {
      const namespace: unknown = Reflect.get(api, entry.name);
      for (const member of entry.members) {
        const live: unknown = Reflect.get(Object(namespace), member.name);
        expect(typeof live === 'function').toBe(member.kind !== 'value');
        if (typeof live !== 'function') continue;
        if (member.kind === 'timer') {
          const timer: unknown = live(0, () => undefined);
          expect(typeof Reflect.get(Object(timer), 'cancel')).toBe('function');
          Reflect.get(Object(timer), 'cancel')();
        } else if (member.kind === 'sync') {
          const answered: unknown = live(...(SYNC_ARGUMENTS[member.name] ?? ['x']));
          expect(answered instanceof Promise).toBe(false);
        } else if (member.kind === 'stream') {
          const stream: unknown = live(['true']);
          expect(typeof Reflect.get(Object(stream), Symbol.asyncIterator)).toBe('function');
        } else {
          const answered: unknown = live();
          expect(answered instanceof Promise).toBe(true);
          await Promise.resolve(answered).catch(() => undefined);
        }
      }
    }
  });

  test('describes the `$` a mod got after engine.create: an added namespace is described, a withheld one is not', async () => {
    const h = await apiHarness({ options: { canWithhold: true } });
    await h.mod('org-policy', 'prepend', [
      fn('engine.create', async (_$, e, next) => {
        const { env, ...built } = record(await next(e));
        const kept = Object.fromEntries(
          Object.entries(built).filter(([name]) => name === 'fs' || name === 'plugin'),
        );
        return { ...kept, env, extras: { shout: () => Promise.resolve('hey') } };
      }),
    ]);
    const b = await h.mod('b', 'user', []);
    const described = describeApi(b.api);
    expect(described.map((entry) => entry.name)).toEqual(['plugin', 'env', 'fs', 'extras']);
    expect(membersOf(described, 'extras')).toEqual([{ name: 'shout', kind: 'call', async: true }]);
  });
});
