import type { ModsNamespaceApi } from '../types.ts';
import { call, type Deps } from './call.ts';

export const turnApi = (deps: Deps): ModsNamespaceApi<'turn'> => ({
  abort: async () => call(deps, 'turn.abort', {}, () => deps.ports.turns.abort()),
});
