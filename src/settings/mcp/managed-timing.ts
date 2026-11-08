import type { McpCandidate } from './scope.ts';

/**
 * How `managedMcpServers` reaches the machine (managed-mcp.md, "When provided servers connect"):
 * through server-managed settings, which are fetched, through a Claude apps gateway sign-in, "Claude
 * Code loads the policy before the session starts", or from the device itself (MDM, registry,
 * `managed-settings.json`), judged to be read before the session too (spec/judgments.md).
 */
export const MANAGED_DELIVERIES = ['serverManaged', 'gateway', 'device'] as const;
export type ManagedDelivery = (typeof MANAGED_DELIVERIES)[number];

export interface ProvidedTimingInput {
  readonly delivery: ManagedDelivery;
  /** An interactive session; `false` for a `claude -p` run. */
  readonly interactive: boolean;
  /** The machine has a cached copy of the server-managed settings. */
  readonly cached: boolean;
  /** The server did not confirm the settings for this session. */
  readonly confirmationFailed: boolean;
}

export interface ProvidedTiming {
  /** MCP servers wait for the server's confirmation before they load. */
  readonly waitsForConfirmation: boolean;
  /** The provided servers are part of the session's first connection. */
  readonly connectsAtStart: boolean;
  /** An interactive first launch connects them as soon as the settings arrive. */
  readonly connectsOnArrival: boolean;
  /** A `claude -p` run that has already started "can finish without them". */
  readonly mayFinishWithout: boolean;
  /** What `/status` says when they are withheld. */
  readonly withheld: string | undefined;
}

const WITHHELD =
  'Managed MCP servers are withheld: the server did not confirm the managed settings for this session';

const atStart: ProvidedTiming = {
  waitsForConfirmation: false,
  connectsAtStart: true,
  connectsOnArrival: false,
  mayFinishWithout: false,
  withheld: undefined,
};

/** "withholds the cached copy of this key until the server confirms", then "waits for that confirmation". */
const cachedCopy = (input: ProvidedTimingInput): ProvidedTiming => ({
  ...atStart,
  waitsForConfirmation: true,
  connectsAtStart: !input.confirmationFailed,
  withheld: input.confirmationFailed ? WITHHELD : undefined,
});

/** "On a machine's first launch, with nothing cached yet". */
const firstLaunch = (input: ProvidedTimingInput): ProvidedTiming => ({
  ...atStart,
  connectsAtStart: false,
  connectsOnArrival: input.interactive,
  mayFinishWithout: !input.interactive,
});

const TIMINGS: { readonly [D in ManagedDelivery]: (input: ProvidedTimingInput) => ProvidedTiming } =
  {
    serverManaged: (input) => (input.cached ? cachedCopy(input) : firstLaunch(input)),
    gateway: () => atStart,
    device: () => atStart,
  };

/** When the provided servers connect in a session that starts (managed-mcp.md, "When provided servers connect"). */
export const providedServersTiming = (input: ProvidedTimingInput): ProvidedTiming =>
  TIMINGS[input.delivery](input);

export interface ManagedServerChanges {
  readonly add: readonly string[];
  readonly change: readonly string[];
  readonly remove: readonly string[];
}

/** The same value with the keys of every object in order, so two spellings of one definition compare equal. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value !== 'object' || value === null) return JSON.stringify(value);
  const fields = Object.entries(value).toSorted(([a], [b]) => a.localeCompare(b));
  return `{${fields.map(([key, each]) => `${JSON.stringify(key)}:${canonical(each)}`).join(',')}}`;
}

const NO_CHANGES: ManagedServerChanges = { add: [], change: [], remove: [] };

/**
 * What a running session does when the provided servers change: "Add a server: Claude Code connects
 * it when the updated settings arrive, without a restart"; "Change a server's entry: those sessions
 * reconnect to it with the new definition"; "Remove a server: a running interactive session
 * disconnects it once it reads the changed settings. A non-interactive (`-p`) run keeps it until it
 * ends." The host diffs by list, since events exist only on managed E2B (owner's note). Judgment: a
 * `-p` run applies none of the three, as "Interactive sessions that are already running apply your
 * edits".
 */
export function reconcileManagedServers(
  previous: readonly McpCandidate[],
  next: readonly McpCandidate[],
  session: { readonly interactive: boolean },
): ManagedServerChanges {
  if (!session.interactive) return NO_CHANGES;
  const before = new Map(previous.map((each) => [each.name, canonical(each.server)]));
  const after = new Map(next.map((each) => [each.name, canonical(each.server)]));
  return {
    add: [...after.keys()].filter((name) => !before.has(name)),
    change: [...after]
      .filter(([name, text]) => before.has(name) && before.get(name) !== text)
      .map(([name]) => name),
    remove: [...before.keys()].filter((name) => !after.has(name)),
  };
}
