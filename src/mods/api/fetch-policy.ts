/**
 * Which controls cover a mod's `$.http.fetch` (plugins/mods/admin.md, "Know which controls still
 * apply", "Network policy covers `$.http.fetch`"). Pure: the host knows the facts, the kit decides.
 * `$.process.run` is outside it: "None of these covers a program the mod starts".
 */

import type { FetchRequest } from './ports.ts';

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

/** One request a mod sends, as the host is asked about it. */
type PolicedRequest = Pick<FetchRequest, 'url' | 'method' | 'headers' | 'auth'>;

/** What the host knows about one request; whether the mod is built in the kit knows itself. */
export type FetchPolicyFacts = (request: PolicedRequest) => Omit<ModFetchFacts, 'builtIn'>;

const REFUSALS = {
  'organization-policy': "your organization's policy doesn't allow WebFetch",
  'nonessential-traffic': 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC stops this request',
} as const;

/** Throws when network policy stops `request`; without facts from the host, nothing does. */
export function checkFetchPolicy(
  facts: FetchPolicyFacts | undefined,
  builtIn: boolean,
  request: PolicedRequest,
): void {
  if (facts === undefined) return;
  const known = facts(request);
  // A request with an `auth` handle carries the session's credentials whatever the host says.
  const carriesSessionCredentials = known.carriesSessionCredentials || request.auth !== undefined;
  const verdict = modFetchVerdict({ ...known, carriesSessionCredentials, builtIn });
  if (!verdict.allowed) throw new Error(`$.http.fetch: refused: ${REFUSALS[verdict.reason]}`);
}
