import type { HookEvent } from '../../protocol/official.ts';
import { matchesMatcher } from '../../rules/index.ts';
import type {
  EventFactsOf,
  ModelCatalog,
  MonitorTreatment,
  RegisteredHandler,
} from '../contracts.ts';
import { monitorTreatment } from './mcp-tools.ts';
import { targetOf } from './matcher-targets.ts';

/** Whether a handler's matcher selects an occurrence of the event, and how a Monitor call got there. */
export interface MatcherResult {
  readonly selects: boolean;
  readonly monitor?: MonitorTreatment;
}

/**
 * hooks.md, "Matcher patterns": the matcher is tested against the field the event filters on, in
 * the grammar the event accepts. An event without matcher support ignores it, and a model switch
 * with no canonical name runs every hook ("regardless of matcher").
 */
export function matcherSelects<E extends HookEvent>(
  event: E,
  facts: EventFactsOf<E>,
  entry: RegisteredHandler,
  modelCatalog?: ModelCatalog,
): MatcherResult {
  const target = targetOf(event);
  const found = target.valueOf(facts, modelCatalog === undefined ? {} : { modelCatalog });
  if (!found.filters) return { selects: true };
  const direct = matchesMatcher(entry.matcher, found.value, target.mode);
  const call = target.call?.(facts);
  const monitor = monitorTreatment(
    event,
    call,
    { matcher: entry.matcher, ifRule: entry.handler.if },
    direct,
  );
  return monitor === undefined ? { selects: direct } : { selects: true, monitor };
}
