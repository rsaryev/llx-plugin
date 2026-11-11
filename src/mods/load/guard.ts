import type { DenyRuleChecker } from '../ports.ts';
import type { ModNext, ModsApi, RegisteredHook } from '../types.ts';
import { guardOption, type ModsPolicyInput } from './policy-input.ts';
import type { RefusalBook } from './register-call.ts';
import { isRecord } from '../../protocol/is-record.ts';

/**
 * The built-in guard `sec-default@builtin` (plugins/mods/admin.md, "Know what happens by default",
 * "Set options on the built-in guard"; troubleshoot.md, "Messages from the built-in guard"). It is
 * a mod that loads ahead of every mod a person installs and answers two events: `plugin.register`
 * (`allowManagedModsOnly`) and `tool.check` (a user's mod approving a call a deny rule refuses).
 */

/** The text after `refused by cc-plugin-sec-default:` (troubleshoot.md quotes it). */
const MODS_LIMITED = "mods are limited to your organization's by policy (allowManagedModsOnly)";
/** Judgment: the docs say the guard "refuses every user's mod at load" without quoting a line. */
const MANAGED_UNREADABLE =
  "managed settings could not be read, so mods that are not your organization's are refused";
const LIFT_ATTEMPT = 'tried to lift a deny rule in your settings';
const CHECK_FAILED =
  'the deny rules in your settings could not be checked for this call, so it is refused';

type Any = Promise<unknown> | AsyncGenerator<unknown, unknown>;
type Next = ModNext<unknown, Any>;

/** What the guard refuses at `plugin.register`: a mod in the `user` tier, when `allowManagedModsOnly` is set or managed settings cannot be read. */
function registerRefusal(policy: ModsPolicyInput, tier: unknown): string | undefined {
  if (tier !== 'user') return undefined;
  if (policy.managedUnreadable === true) return MANAGED_UNREADABLE;
  return guardOption(policy, 'allowManagedModsOnly') ? MODS_LIMITED : undefined;
}

/** Who approved the call in progress: the hooks of the mods the guard watches record themselves here. */
export interface ApprovalLedger {
  approvers: string[];
}

export interface GuardOptions {
  readonly policy: ModsPolicyInput;
  readonly deny: DenyRuleChecker;
  readonly ledger: ApprovalLedger;
  readonly debug: (line: string) => void;
  /** The line for the transcript (or only the debug log, in a `claude -p` run): the host decides where it is read. */
  readonly notice?: (line: string) => void;
  /** The mods the guard already said it refused a lift for: "once for each mod in a session". */
  readonly told?: Set<string>;
}

const decisionOf = (result: unknown): unknown => (isRecord(result) ? result.decision : undefined);

/** The line of a lift the guard refused: to the debug log and the transcript, once for each mod in a session. */
function tell(options: GuardOptions, line: string, mod: string): void {
  const told = options.told;
  if (told?.has(mod)) return;
  told?.add(mod);
  options.debug(line);
  options.notice?.(line);
}

/**
 * A call a user's mod approved, judged against the deny rules (admin.md: "a user's mod can't
 * approve a call that a `deny` rule refuses or an `ask` rule prompts for"; with
 * `allowModsToOverrideDenyRules` a `deny` rule yields, an `ask` rule does not). "If it can't check
 * the deny rules for a call that a user's mod approved, it refuses the call."
 */
async function checkApproval(options: GuardOptions, e: unknown, result: unknown): Promise<unknown> {
  const approvers = options.ledger.approvers;
  if (approvers.length === 0 || !isRecord(e)) return result;
  const verdict = await options.deny.verdict(String(e.tool), e.input);
  const lifts =
    verdict === 'ask' ||
    (verdict === 'deny' && !guardOption(options.policy, 'allowModsToOverrideDenyRules'));
  if (verdict === 'unknown') return { decision: 'deny', reason: CHECK_FAILED };
  if (!lifts) return result;
  for (const mod of approvers) tell(options, `${mod} ${LIFT_ATTEMPT}`, mod);
  return { decision: 'deny', reason: `${approvers.join(', ')} ${LIFT_ATTEMPT}` };
}

async function guardToolCheck(options: GuardOptions, e: unknown, next: Next): Promise<unknown> {
  options.ledger.approvers = [];
  const result = await next(e);
  if (decisionOf(result) !== 'allow') return result;
  try {
    return await checkApproval(options, e, result);
  } catch {
    return options.ledger.approvers.length === 0
      ? result
      : { decision: 'deny', reason: CHECK_FAILED };
  }
}

/** The hooks of the guard, registered in the `prepend` tier under `cc-plugin-sec-default`. */
export function guardHooks(options: GuardOptions): readonly RegisteredHook[] {
  return [
    {
      event: 'plugin.register',
      isGenerator: false,
      run: (_$: ModsApi, e: unknown, next: Next): unknown => {
        const refusal = isRecord(e) ? registerRefusal(options.policy, e.tier) : undefined;
        return refusal === undefined ? next(e) : { refuse: refusal };
      },
    },
    {
      event: 'tool.check',
      isGenerator: false,
      run: (_$: ModsApi, e: unknown, next: Next): unknown => guardToolCheck(options, e, next),
    },
  ];
}

/**
 * `hook` of a user's mod that notes itself in the ledger when it approves a call at `tool.check`, so
 * the guard can name the mod that tried to lift a deny rule. Judgment: the first mod to approve is
 * the one named (an inner hook finishes before the hooks around it, which only pass its answer on),
 * and the ledger belongs to the call in progress (checks of one session do not overlap).
 */
export function withApproval(
  hook: RegisteredHook,
  plugin: string,
  tier: string,
  ledger: ApprovalLedger,
): RegisteredHook {
  if (hook.event !== 'tool.check' || tier !== 'user') return hook;
  const note = (result: unknown): unknown => {
    if (decisionOf(result) === 'allow' && ledger.approvers.length === 0)
      ledger.approvers.push(plugin);
    return result;
  };
  return {
    ...hook,
    run: (api, e, next) => {
      const out = hook.run(api, e, next);
      return Promise.resolve(out).then(note);
    },
  };
}

/** `run` the first time it is called; a later call waits for nothing and does nothing (an unload that is asked twice). */
export function once(run: () => Promise<void>): () => Promise<void> {
  let started: Promise<void> | undefined;
  return () => (started ??= run());
}

/** Takes a mod that unloaded out of the approval ledger and the refusal book, so neither names it again. */
export function forgetMod(
  env: { readonly ledger: ApprovalLedger; readonly book: RefusalBook },
  name: string,
): void {
  env.ledger.approvers = env.ledger.approvers.filter((approver) => approver !== name);
  for (const [reason, refuser] of env.book.refusers) {
    if (refuser === name) env.book.refusers.delete(reason);
  }
}
