/**
 * Which controls cover a mod's `$.http.fetch` (plugins/mods/admin.md, "Know which controls still
 * apply", "Network policy covers `$.http.fetch`"). Pure: the host knows the facts, the kit decides.
 * `$.process.run` is outside it: "None of these covers a program the mod starts".
 */

export interface ModFetchFacts {
  /** The session's organization policy does not allow WebFetch (tools-reference.md, "WebFetch availability"). */
  readonly orgPolicyDeniesWebFetch: boolean;
  /** `CLAUDE_CODE_DISABLE_WEB_FETCH` or a `WebFetch` deny rule: they turn the tool off, not a mod's request. */
  readonly webFetchToolOff: boolean;
  /** Any non-empty `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`. */
  readonly disableNonessentialTraffic: boolean;
  /** The mod is built into Claude Code, not one a person or the organization installed. */
  readonly builtIn: boolean;
  /** The request carries the session's Anthropic credentials. */
  readonly carriesSessionCredentials: boolean;
}

export type ModFetchVerdict =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: 'organization-policy' | 'nonessential-traffic' };

/**
 * "Your organization's policy doesn't allow WebFetch: Claude Code also refuses every mod's request."
 * With `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` the variable "stops only the mods built into Claude
 * Code, plus any request that carries the session's Anthropic credentials". The tool being off by
 * variable or deny rule stops nothing here.
 */
export function modFetchVerdict(facts: ModFetchFacts): ModFetchVerdict {
  if (facts.orgPolicyDeniesWebFetch) return { allowed: false, reason: 'organization-policy' };
  const stoppedByTraffic =
    facts.disableNonessentialTraffic && (facts.builtIn || facts.carriesSessionCredentials);
  return stoppedByTraffic ? { allowed: false, reason: 'nonessential-traffic' } : { allowed: true };
}
