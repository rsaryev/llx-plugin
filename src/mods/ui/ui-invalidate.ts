import { z } from 'zod';
import { fire, parse, type Deps } from '../api/call.ts';
import type { RerunEvent } from './ports.ts';
import type { UiParts } from './ui-api.ts';

/**
 * What each argument of `$.ui.invalidate` runs again: the sites' `ui.render` hooks, throttled
 * (interface.md, "Redraw when your data changes"), or the hooks of an event whose answers the
 * engine caches, which the host runs again (`InvalidatableEventName`, claude-code/index.d.ts:5929:
 * `prompt.section`, `prompt.context`, `prompt.attachment`, `tool.describe`, `command.describe`,
 * `config.describe`). Any other argument is refused.
 */
const RERUN_TARGETS = [
  'prompt.section',
  'prompt.context',
  'prompt.attachment',
  'tool.describe',
  'command.describe',
  'config.describe',
] as const satisfies readonly RerunEvent[];
const INVALIDATE_TARGETS = ['ui.render', ...RERUN_TARGETS] as const;
const invalidateTarget = z.enum(INVALIDATE_TARGETS, {
  error: `takes ${INVALIDATE_TARGETS.map((name) => `'${name}'`).join(', ')}`,
});
const invalidateEvent = z.looseObject({ event: invalidateTarget });

const rerun =
  (event: RerunEvent) =>
  (parts: UiParts): void =>
    parts.iface.rerun(event);
const INVALIDATES: {
  readonly [T in (typeof INVALIDATE_TARGETS)[number]]: (parts: UiParts) => void;
} = {
  'ui.render': (parts) => parts.invalidator.invalidate(),
  'prompt.section': rerun('prompt.section'),
  'prompt.context': rerun('prompt.context'),
  'prompt.attachment': rerun('prompt.attachment'),
  'tool.describe': rerun('tool.describe'),
  'command.describe': rerun('command.describe'),
  'config.describe': rerun('config.describe'),
};

/** `$.ui.invalidate(event)`: fires `ui.invalidate` with `{ event }`, then runs again what it names. */
export function invalidate(deps: Deps, parts: UiParts, given: unknown): void {
  const event = parse('$.ui.invalidate', invalidateTarget, given);
  fire(deps, 'ui.invalidate', { event }, (e) =>
    Promise.resolve(INVALIDATES[parse('$.ui.invalidate', invalidateEvent, e).event](parts)),
  );
}
