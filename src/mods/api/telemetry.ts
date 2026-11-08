import { z } from 'zod';
import { TELEMETRY_FILTER } from '../../protocol/mods-events.ts';
import type { ModsNamespaceApi } from '../types.ts';
import { call, parse, type Deps } from './call.ts';
import { isCollectorOrigin } from './telemetry-origin.ts';

const record = z.record(z.string(), z.json());
const mark = z.looseObject({ feature: z.string() });

/** The event carries `to: 'collector'`, which the hooks' required filter matches (reference.md, "Telemetry"). */
const toCollector = TELEMETRY_FILTER;

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
      const row = parse('$.telemetry.log', record, args[0]);
      if (!sends()) return undefined;
      return call(deps, 'telemetry.log', { ...toCollector, record: row }, async (e) =>
        telemetry.log(parse('$.telemetry.log', z.looseObject({ record }), e).record),
      );
    },
    mark: async (...args) => {
      const feature = parse('$.telemetry.mark', z.string(), args[0]);
      if (!sends()) return undefined;
      return call(deps, 'telemetry.mark', { ...toCollector, feature }, async (e) =>
        telemetry.mark(parse('$.telemetry.mark', mark, e).feature),
      );
    },
  };
}
