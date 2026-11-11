import { z } from 'zod';
import type { ModsNamespaceApi } from '../types.ts';
import { call, parse, type Deps } from './call.ts';

/** `$.turn.abort({ turnId })` (claude-code/index.d.ts:3102): the id the main loop's `turn.start` carried. */
const abort = z.looseObject({ turnId: z.string() });

export const turnApi = (deps: Deps): ModsNamespaceApi<'turn'> => ({
  abort: async (...args) =>
    call(deps, 'turn.abort', parse('$.turn.abort', abort, args[0]), (e) =>
      deps.ports.turns.abort(parse('$.turn.abort', abort, e).turnId),
    ),
});
