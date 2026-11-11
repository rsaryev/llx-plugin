import type { HookEvent } from '../../protocol/official.ts';
import { OUTPUT_CAPS } from './caps.ts';
import { hasText } from './fields.ts';
import { factOf } from '../input/fact-read.ts';
import type { Read } from './merge-rules.ts';

/**
 * Where a hook's `systemMessage` goes (hooks.md, "JSON output": "Warning message shown to the
 * user"). `DirectoryAdded` is the one event that routes it by source: "`slash_command`: Claude Code
 * delivers the hook's `systemMessage` to Claude as context on the next conversation turn, rather
 * than showing it to you. `register_repo_root`: Claude Code writes `systemMessage` output ... to
 * the debug log only".
 */

type Route = 'user' | 'claude' | 'debug';

const DIRECTORY_SOURCES: ReadonlyMap<unknown, Route> = new Map<unknown, Route>([
  ['slash_command', 'claude'],
  ['register_repo_root', 'debug'],
]);

const ROUTES: { readonly [E in HookEvent]?: (facts: object) => Route } = {
  DirectoryAdded: (facts) => DIRECTORY_SOURCES.get(factOf(facts, 'source')) ?? 'user',
};

export interface RoutedMessages {
  /** Shown to the user, in registry order. */
  readonly toUser: readonly string[];
  /** Added to Claude's context on the next turn. */
  readonly toClaude: readonly string[];
}

export function routeMessages(
  event: HookEvent,
  reads: readonly Read[],
  facts: object,
): RoutedMessages {
  if (!OUTPUT_CAPS[event].accepts.has('systemMessage')) return { toUser: [], toClaude: [] };
  const messages = reads.flatMap((read) =>
    hasText(read.output?.systemMessage) ? [read.output.systemMessage] : [],
  );
  const route = ROUTES[event]?.(facts) ?? 'user';
  return {
    toUser: route === 'user' ? messages : [],
    toClaude: route === 'claude' ? messages : [],
  };
}
