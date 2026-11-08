import { error, type PluginIssue } from '../../../format/issues.ts';
import { ENGINE_ORIGIN } from '../../../protocol/mods-events.ts';
import type { Surface } from '../../../protocol/mods-ui-names.ts';
import { messageOf } from '../../api/call.ts';
import type { HookReport, ModChain } from '../../types.ts';
import { isRecord } from '../elements/node.ts';
import { collectControls, type Control, type ControlType } from './keys.ts';

/** What the user does to a control: the event it fires and the control and callback it reaches. */
export const GESTURES = {
  press: { event: 'ui.press', control: 'Button', callback: 'onPress' },
  submit: { event: 'ui.input', control: 'Input', callback: 'onSubmit' },
  change: { event: 'ui.input', control: 'Input', callback: 'onInput' },
  select: { event: 'ui.select', control: 'Select', callback: 'onSelect' },
} as const satisfies Readonly<
  Record<string, { event: string; control: ControlType; callback: string }>
>;
export type Gesture = keyof typeof GESTURES;

export interface RouteOptions {
  readonly chain: ModChain;
  readonly tree: unknown;
  readonly surface: Surface;
  readonly signal: AbortSignal;
  readonly report: (report: HookReport) => void;
}

export interface Routed {
  /** What stopped the gesture: no control, or a key that is not each once. Never a throw. */
  readonly issues: readonly PluginIssue[];
  /** Whether the control's callback ran. */
  readonly ran: boolean;
}

/** The control a gesture addresses by `key`, or why there is not exactly one. */
function addressed(
  tree: unknown,
  gesture: Gesture,
  key: string,
): { readonly control: Control } | { readonly issue: PluginIssue } {
  const { control: type } = GESTURES[gesture];
  const matches = collectControls(tree).filter((c) => c.type === type && c.key === key);
  const [only] = matches;
  if (only && matches.length === 1) return { control: only };
  const why =
    matches.length === 0
      ? `no ${type} with the key "${key}" is drawn`
      : `${gesture} needs key each once: ${matches.length} ${type}s have the key "${key}"`;
  return { issue: error(`ui.${gesture}`, why) };
}

function callbackOf(
  control: Control,
  gesture: Gesture,
): ((...args: unknown[]) => unknown) | undefined {
  const given = control.node.props[GESTURES[gesture].callback];
  return typeof given === 'function'
    ? (...args) => Reflect.apply(given, undefined, args)
    : undefined;
}

/** What the callback receives: a press gets `{ surface }`, typing and picking get the value. */
const argumentOf = (gesture: Gesture, surface: Surface, e: unknown): unknown =>
  gesture === 'press' || !isRecord(e) ? { surface } : e.value;

/**
 * Routes a user's gesture to a control by its key (interface.md, "Respond to presses and typing"):
 * Claude Code fires `ui.press`, `ui.input` or `ui.select` with the control's key in `e.element`
 * before it runs the callback, so another mod's hook sees what was typed and can change it or
 * keep the callback from running (by not calling `next`). `value` is the text typed or the option
 * picked. Judgment: the field holding it is `value`, and `ui.press` carries `surface`.
 */
export async function routeControl(
  options: RouteOptions,
  gesture: Gesture,
  key: string,
  value?: unknown,
): Promise<Routed> {
  const found = addressed(options.tree, gesture, key);
  if ('issue' in found) return { issues: [found.issue], ran: false };
  const run = callbackOf(found.control, gesture);
  let ran = false;
  const issues: PluginIssue[] = [];
  const input = {
    element: key,
    surface: options.surface,
    ...(gesture === 'press' ? {} : { value }),
  };
  await options.chain.dispatch(GESTURES[gesture].event, input, {
    origin: ENGINE_ORIGIN,
    signal: options.signal,
    report: options.report,
    core: async (e) => {
      if (!run) return undefined;
      ran = true;
      try {
        return await run(argumentOf(gesture, options.surface, e));
      } catch (thrown) {
        issues.push(error(`ui.${gesture}`, `the callback of "${key}" threw: ${messageOf(thrown)}`));
        return undefined;
      }
    },
  });
  return { issues, ran };
}
