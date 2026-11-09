import { warning, type PluginIssue } from '../../format/issues.ts';
import type { HookEvent } from '../../protocol/official.ts';
import type {
  EventFactsOf,
  HookRegistry,
  HookSession,
  ModelCatalog,
  MonitorTreatment,
  RegisteredHandler,
  Selection,
  ToolCallView,
} from '../contracts.ts';
import { firesForTool, supportsHandlerType } from './event-catalog.ts';
import { dedupeSettingsHandlers } from './dedupe.ts';
import { passesGates } from './gates.ts';
import { guardWithIf, type IfEvaluator } from './if-guard.ts';
import { lacksMcpClient, noMcpClientMessage } from './mcp-client.ts';
import { matcherSelects } from './matcher.ts';
import { targetOf } from './matcher-targets.ts';

export interface SelectRequest<E extends HookEvent> {
  readonly event: E;
  readonly facts: EventFactsOf<E>;
  readonly session: HookSession;
  /** Reads a handler's `if`; without one a handler with `if` runs and a warning says why. */
  readonly ifEvaluator?: IfEvaluator;
  /** Names the canonical model of a model switch; without one every model-switch hook runs. */
  readonly modelCatalog?: ModelCatalog;
}

interface Verdict {
  readonly selected: boolean;
  readonly monitor?: MonitorTreatment;
  readonly issues: readonly PluginIssue[];
}

const SKIPPED: Verdict = { selected: false, issues: [] };

/** Where an issue about one handler is reported: the event and the handler's place under it. */
const pathOf = (event: HookEvent, index: number): string => `hooks.${event}[${index}]`;

/**
 * One handler against the event: its type is supported (an unsupported one "is skipped", reported
 * as a warning: spec/judgments.md), its matcher selects the occurrence, an `mcp_tool` one has an MCP
 * client to call, and its `if` lets it run.
 */
function judge<E extends HookEvent>(
  entry: RegisteredHandler,
  index: number,
  request: SelectRequest<E>,
  call: ToolCallView | undefined,
): Verdict {
  const { event, facts, modelCatalog, ifEvaluator } = request;
  const path = pathOf(event, index);
  if (!supportsHandlerType(event, entry.handler.type)) {
    const message = `A hook of type ${entry.handler.type} is not supported on ${event} and is skipped`;
    return { selected: false, issues: [warning(path, message)] };
  }
  const matched = matcherSelects(event, facts, entry, modelCatalog);
  if (!matched.selects) return SKIPPED;
  if (lacksMcpClient(event, facts, entry.handler.type)) {
    return { selected: false, issues: [warning(path, noMcpClientMessage(event))] };
  }
  const guard = guardWithIf(entry, { call, monitor: matched.monitor, evaluate: ifEvaluator }, path);
  return {
    selected: guard.runs,
    issues: guard.issues,
    ...(matched.monitor === undefined ? {} : { monitor: matched.monitor }),
  };
}

/**
 * The handlers an event runs (hooks.md, "How a hook resolves"): the registered handlers of the
 * event that nothing gates off (`disableAllHooks`, workspace trust, a disabled plugin), with a
 * settings handler defined twice kept once, whose type the event supports, whose matcher selects
 * the occurrence and whose `if` lets them run. Tool calls an event skips select nothing.
 */
export function selectHandlers<E extends HookEvent>(
  registry: Pick<HookRegistry, 'entries'>,
  request: SelectRequest<E>,
): Selection {
  const { event, facts, session } = request;
  const ofEvent = registry.entries.filter((entry) => entry.event === event);
  const call = targetOf(event).call?.(facts);
  if (call !== undefined && !firesForTool(event, call.toolName)) {
    return { selected: [], issues: [], monitor: new Map() };
  }
  const selected: RegisteredHandler[] = [];
  const issues: PluginIssue[] = [];
  const monitor = new Map<RegisteredHandler, MonitorTreatment>();
  for (const entry of dedupeSettingsHandlers(ofEvent.filter((e) => passesGates(e, session)))) {
    const verdict = judge(entry, ofEvent.indexOf(entry), request, call);
    issues.push(...verdict.issues);
    if (!verdict.selected) continue;
    selected.push(entry);
    if (verdict.monitor !== undefined) monitor.set(entry, verdict.monitor);
  }
  return { selected, issues, monitor };
}
