import { z } from 'zod';
import { TELEMETRY_FILTER } from '../../protocol/mods-events.ts';
import type { ModsNamespaceApi } from '../types.ts';
import type { TelemetryMark } from '../ports.ts';
import { call, parse, type Deps } from './call.ts';
import { isCollectorOrigin } from './telemetry-origin.ts';

const props = z.record(z.string(), z.json());

/**
 * `$.telemetry.log(entry)` (claude-code/index.d.ts:3347, `TelemetryLogArgs`): a first-party row
 * `{ event, props?, to? }` or a collector record `{ to: 'collector', event, attributes, ... }`. Its
 * event carries the entry's fields, `to` "pinned, and `anthropic` when left out" (:3331).
 */
const entry = z.looseObject({
  event: z.string(),
  to: z.enum(['anthropic', 'collector']).optional(),
  props: props.optional(),
});
const record = z.record(z.string(), z.json());

/** `$.telemetry.mark(entry)` (:3362, `TelemetryMarkInput`): the feature, how its use went, why, its properties. */
const mark = z.object({
  feature: z.string(),
  kind: z.enum(['ok', 'bad', 'sad']),
  reason: z.string().optional(),
  props: props.optional(),
});

/**
 * Judgment (spec/judgments.md, D6): a mark "takes no `to`" (:3355), yet the docs make a mod's
 * telemetry hook name `{ to: 'collector' }` (reference.md, "Telemetry") and any plugin "may hook"
 * a mark (:3358); the kit's mark event keeps `to: 'collector'` so that filter lets it through.
 */
const toCollector = TELEMETRY_FILTER;

const markOf = (e: unknown): TelemetryMark => {
  const { feature, kind, reason, props: given } = parse('$.telemetry.mark', mark, e);
  return {
    feature,
    kind,
    ...(reason === undefined ? {} : { reason }),
    ...(given === undefined ? {} : { props: given }),
  };
};

/**
 * `$.telemetry`: "A record is sent only when Claude Code or a built-in mod makes the call"
 * (reference.md, "Mods API methods"). A call by any other mod resolves and sends nothing, and fires
 * no event: no record is about to go to the collector (judgment).
 */
export function telemetryApi(deps: Deps): ModsNamespaceApi<'telemetry'> {
  const { telemetry } = deps.ports;
  const sends = (): boolean => isCollectorOrigin(deps.scope.current().origin);
  return {
    log: async (...args) => {
      const given = parse('$.telemetry.log', entry, args[0]);
      if (!sends()) return undefined;
      const input = { ...parse('$.telemetry.log', record, given), to: given.to ?? 'anthropic' };
      return call(deps, 'telemetry.log', input, async (e) =>
        telemetry.log(parse('$.telemetry.log', record, e)),
      );
    },
    mark: async (...args) => {
      const given = markOf(args[0]);
      if (!sends()) return undefined;
      return call(deps, 'telemetry.mark', { ...given, ...toCollector }, async (e) => {
        const marked = markOf(e);
        return telemetry.mark(marked.feature, marked);
      });
    },
  };
}
