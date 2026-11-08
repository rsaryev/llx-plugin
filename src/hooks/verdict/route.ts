import type { HookEvent } from '../../protocol/official.ts';
import { EXIT2_RULES, type StderrChannel } from './exit2.ts';
import type { BlockInfo, BlockRoute, BlockVia, HandlerVerdict } from './types.ts';

/**
 * Where the text of a block goes (hooks.md, "Exit code 2 behavior per event" and the event
 * sections): the route of an event's exit-2 row, applied to every block on it, since a failure
 * "does what exit code 2 does on that event" and a blocking decision "routes the same way".
 */

interface Route {
  readonly to: BlockRoute;
  /** The docs send the hook's command and stderr to the debug log. */
  readonly logged: boolean;
}

const ROUTES: { readonly [C in StderrChannel]: Route } = {
  claude: { to: 'claude', logged: false },
  user: { to: 'user', logged: false },
  'user-and-claude': { to: 'user-and-claude', logged: false },
  debug: { to: 'none', logged: true },
  discarded: { to: 'none', logged: false },
};

/**
 * Judgment (spec/judgments.md): a `PermissionRequest` failure that denies has the table's
 * "discarded" row for exit 2, which it does not do; the denial's text goes to Claude ("`message`:
 * tells Claude why the permission was denied").
 */
const routeOf = (event: HookEvent): Route => {
  const rule = EXIT2_RULES[event];
  return rule.failureDenies === true ? ROUTES.claude : ROUTES[rule.stderr];
};

/** The text a block carries, before the route decides whether anyone is shown it. */
export interface BlockText {
  readonly reason: string;
  readonly message: string;
}

/** A block on `event`: the text stays with the hook when the docs show it to no one. */
export function routedBlock(
  event: HookEvent,
  via: BlockVia,
  text: BlockText,
  condition?: BlockInfo['condition'],
): BlockInfo {
  const { to, logged } = routeOf(event);
  const more = condition === undefined ? {} : { condition };
  if (to !== 'none') return { via, to, ...text, ...more };
  return { via, to, reason: '', message: '', ...(logged ? { debug: text.message } : {}), ...more };
}

/**
 * "You see it as a warning in the transcript, and it stays in the conversation, so Claude sees it
 * when the conversation continues": a block routed to both also leaves a notice and feedback.
 */
export function shownWith(
  handlerId: string,
  block: BlockInfo,
): Pick<HandlerVerdict, 'notice' | 'feedback'> {
  if (block.to !== 'user-and-claude') return {};
  return {
    notice: { handlerId, message: block.message },
    feedback: { handlerId, to: 'claude', text: block.message },
  };
}
