import { z } from 'zod';
import type { ApiEventName, ModTier } from '../../protocol/mods-events.ts';
import { MOD_LIMITS } from '../../protocol/mods-limits.ts';
import type { ModsNamespaceApi } from '../types.ts';
import { call, parse, pluginOrigin, type Deps } from './call.ts';
import type { JsonObject } from '../../foundation/index.ts';
import type { EventData } from './ports.ts';
import { isRecord } from '../../protocol/is-record.ts';

/** Who `$.session.send` sends to: `{ sessionId }`, `{ agentId }`, or the string address a message came from (api.md, "Send and receive messages between sessions"). */
const target = z.union([
  z.string(),
  z.object({ sessionId: z.string() }),
  z.object({ agentId: z.string() }),
]);
const send = z.looseObject({ to: target, text: z.string() });
const sendEvent = z.looseObject({ to: z.string(), text: z.string() });

/** `e.to` arrives as a string even when the mod passed `{ sessionId }` (test.md, "Look up what a stub returns"). */
function address(to: z.infer<typeof target>): string {
  if (typeof to === 'string') return to;
  return 'sessionId' in to ? to.sessionId : to.agentId;
}

/**
 * `$.session.append({ message, agentId? })` (claude-code/index.d.ts:3057, `SessionAppendArgs`): a
 * `user` row the model reads or a `system` notice, its content blocks; the host refuses any block
 * but text, with the reason. The event's `door`, `origin` and `uuid` (:4640) are the engine's.
 */
const append = z.looseObject({
  message: z.looseObject({
    type: z.enum(['user', 'system']),
    content: z.array(z.looseObject({ type: z.string() })),
  }),
  agentId: z.string().optional(),
});

/**
 * `{ version, base?, builtAt? }` (claude-code/index.d.ts:3019): from a host that answers the version
 * alone, `base` is its release spelling (`2.1.280`, `2.1.280-dev`), absent when it is spelled as none.
 */
function versionOf(given: string | JsonObject): JsonObject {
  if (typeof given !== 'string') return given;
  const base = /^\d+\.\d+\.\d+(?:-dev)?/.exec(given)?.[0];
  return { version: given, ...(base === undefined ? {} : { base }) };
}

const data = (value: unknown, label: string): EventData => {
  if (!isRecord(value)) throw new Error(`${label}: takes one object`);
  return value;
};

/**
 * `$.session.identity()` answers "to a mod the organization's managed settings install; `{ deny }`
 * to any other. No request is made" (claude-code/index.d.ts:3070): the mods of managed
 * `prependPlugins` and `appendPlugins`, the tiers `prepend` and `append`.
 */
const MANAGED_TIERS: ReadonlySet<ModTier> = new Set<ModTier>(['prepend', 'append']);
const isManaged = (tier: ModTier): boolean => MANAGED_TIERS.has(tier);
const NOT_MANAGED = 'the calling mod is not one managed settings enable and load in place';

export function sessionApi(deps: Deps): ModsNamespaceApi<'session'> {
  const { session } = deps.ports;
  const ask =
    <T>(name: ApiEventName, read: () => Promise<T>) =>
    async (): Promise<unknown> =>
      call(deps, name, {}, read);
  return {
    // The newest 4,096 entries (reference.md, "Limits").
    messages: async () =>
      call(deps, 'session.messages', {}, async () =>
        (await session.messages(deps.signal)).slice(-MOD_LIMITS.messages),
      ),
    cwd: ask('session.cwd', () => session.cwd()),
    root: ask('session.root', () => session.root()),
    model: ask('session.model', () => session.model()),
    turns: ask('session.turns', () => session.turns()),
    id: ask('session.id', () => session.id()),
    repo: ask('session.repo', () => session.repo()),
    surfaces: ask('session.surfaces', () => session.surfaces()),
    // "the first of `$.session.surfaces()`, or null where nothing draws" (claude-code/index.d.ts:2973).
    surface: ask('session.surface', async () => (await session.surfaces())[0] ?? null),
    usage: ask('session.usage', () => session.usage()),
    version: ask('session.version', async () => versionOf(await session.version())),
    compact: async () =>
      // A plugin's compaction is `trigger: 'plugin'` (`SessionCompactTrigger`, claude-code/index.d.ts:11913).
      call(deps, 'session.compact', { trigger: 'plugin' }, () => session.compact(deps.signal)),
    send: async (...args) => {
      const sent = parse('$.session.send', send, args[0]);
      const input = { to: address(sent.to), text: sent.text, origin: pluginOrigin(deps) };
      return call(deps, 'session.send', input, async (e) => {
        const { to, text } = parse('$.session.send', sendEvent, e);
        // The kit never refuses a send: the host knows whether the target finished, and words the answer from the reason.
        return session.send(to, text, deps.signal, await deps.gate.refusal());
      });
    },
    append: async (...args) => {
      // A plugin's own append comes in by the door `note` (claude-code/index.d.ts:11728).
      const row = {
        ...parse('$.session.append', append, args[0]),
        door: 'note',
        origin: pluginOrigin(deps),
      };
      return call(deps, 'session.append', row, (e) =>
        session.append(parse('$.session.append', append, e), deps.signal),
      );
    },
    // `authorize()` takes nothing (claude-code/index.d.ts:3069); its event is `{}` (:7392).
    authorize: async () =>
      call(deps, 'session.authorize', {}, (e) =>
        session.authorize(data(e, '$.session.authorize'), deps.signal),
      ),
    identity: async () =>
      isManaged(deps.scope.current().origin.tier)
        ? call(deps, 'session.identity', {}, () => deps.ports.account.identity())
        : { deny: NOT_MANAGED },
  };
}
