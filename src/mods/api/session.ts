import { z } from 'zod';
import type { ApiEventName } from '../../protocol/mods-events.ts';
import { MOD_LIMITS } from '../../protocol/mods-limits.ts';
import type { ModsNamespaceApi } from '../types.ts';
import { call, isRecord, parse, type Deps } from './call.ts';
import type { EventData } from './ports.ts';

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

const data = (value: unknown, label: string): EventData => {
  if (!isRecord(value)) throw new Error(`${label}: takes one object`);
  return value;
};

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
    usage: ask('session.usage', () => session.usage()),
    version: ask('session.version', () => session.version()),
    compact: async () => call(deps, 'session.compact', {}, () => session.compact(deps.signal)),
    send: async (...args) => {
      const sent = parse('$.session.send', send, args[0]);
      return call(deps, 'session.send', { to: address(sent.to), text: sent.text }, (e) => {
        const { to, text } = parse('$.session.send', sendEvent, e);
        return session.send(to, text, deps.signal);
      });
    },
    append: async (...args) => {
      const row = data(args[0], '$.session.append');
      return call(deps, 'session.append', row, (e) =>
        session.append(data(e, '$.session.append'), deps.signal),
      );
    },
    authorize: async (...args) => {
      const request = data(args[0], '$.session.authorize');
      return call(deps, 'session.authorize', request, (e) =>
        session.authorize(data(e, '$.session.authorize'), deps.signal),
      );
    },
  };
}
