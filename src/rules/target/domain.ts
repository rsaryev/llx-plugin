import type { PermissionBehavior } from '../../protocol/official.ts';
import type { SpecifierMatcher } from '../matchers.ts';
import { escapeLiteral } from '../tool-pattern.ts';
import type { PermissionRule } from '../types.ts';
import { inputString } from './input.ts';

/**
 * WebFetch domain rules (permissions.md, "WebFetch"): `domain:` is matched against the hostname of
 * the requested URL, case-insensitively, with a trailing `.` stripped from the rule and the
 * hostname. `example.com` is that host only; a leading `*.` is any subdomain at any depth but not
 * the domain itself; a bare `*` is every host; a `*` anywhere else stands for the text between two
 * dots only, so `example.*` is `example.org` and never `example.evil.com`.
 */

const stripTrailingDot = (host: string): string => (host.endsWith('.') ? host.slice(0, -1) : host);

const normalize = (text: string): string => stripTrailingDot(text.trim().toLowerCase());

/** The port a URL goes to: the one it names, else its scheme's default. */
const DEFAULT_PORT: ReadonlyMap<string, string> = new Map([
  ['http:', '80'],
  ['https:', '443'],
]);

const effectivePort = (url: URL): string => url.port || (DEFAULT_PORT.get(url.protocol) ?? '');

/** A URL that parses and has a host: anything else has no hostname for a rule to match (spec/judgments.md). */
function parseUrl(text: string): URL | undefined {
  try {
    const url = new URL(text);
    return url.hostname === '' ? undefined : url;
  } catch {
    return undefined;
  }
}

/** `*` in the middle of a label or between dots is one label's worth of text, never a dot. */
const WITHIN_A_LABEL = '[^.]*';

function wildcardHost(pattern: string): RegExp {
  const leading = pattern.startsWith('*.');
  const rest = leading ? pattern.slice(2) : pattern;
  const body = rest.split('*').map(escapeLiteral).join(WITHIN_A_LABEL);
  return new RegExp(`^${leading ? '.+\\.' : ''}${body}$`);
}

/** `[::1]` and `[::1]:443` (sandboxing.md, "Network isolation"): the address, and optionally one port. */
const BRACKETED = /^(\[[^\]]*\])(?::(\d+))?$/;

/** The address as a URL spells its hostname, so `[0:0::1]` and `[::1]` are one address. */
function addressHost(bracketed: string): string | undefined {
  return parseUrl(`http://${bracketed}/`)?.hostname;
}

function matchBracketed(address: RegExpExecArray, url: URL): boolean {
  const [, host, port] = address;
  if (host === undefined || addressHost(host) !== url.hostname) return false;
  return port === undefined || port === effectivePort(url);
}

/**
 * Whether the `domain:` pattern of a WebFetch rule covers the host of `url`. An address in brackets
 * (`[::1]`) covers that address on every port, and `[::1]:443` on port 443 only; a URL that does not
 * parse has no host and matches no pattern.
 */
export function matchDomainPattern(pattern: string, url: string): boolean {
  const parsed = parseUrl(url);
  if (parsed === undefined) return false;
  const wanted = normalize(pattern);
  if (wanted === '*') return true;
  const address = BRACKETED.exec(wanted);
  if (address !== null) return matchBracketed(address, parsed);
  return wildcardHost(wanted).test(normalize(parsed.hostname));
}

/**
 * The matcher of the `domain` rule format: a `WebFetch(domain:...)` rule against the call's `url`.
 * A specifier without the `domain:` prefix matches nothing, because the docs give WebFetch no other
 * form (spec/judgments.md).
 */
export const matchWebFetchRule: SpecifierMatcher = (rule, call) => {
  const { specifier } = rule;
  if (specifier?.form !== 'domain') return false;
  const url = inputString(call.input, 'url');
  return url !== undefined && matchDomainPattern(specifier.pattern, url);
};

/** The sandbox's domain lists (sandboxing.md, "Network isolation"). */
export type SandboxList = 'allowed' | 'denied';

/** The host a `WebFetch(domain:...)` rule adds to a sandbox list. */
export interface SandboxDomainEntry {
  readonly list: SandboxList;
  readonly domain: string;
}

/** An allow rule adds its domain to the allowed list, a deny rule to the denied one; an ask rule to neither. */
const SANDBOX_LIST: { readonly [B in PermissionBehavior]: SandboxList | undefined } = {
  allow: 'allowed',
  deny: 'denied',
  ask: undefined,
};

/** "The sandbox honors two wildcard forms: a leading `*.` and a bare `*`": any other `*` has no effect on it. */
const SANDBOX_HONORED = /^(?:\*|\*\.[^*]+|[^*]+)$/;

/**
 * What a rule changes about the hosts sandboxed commands reach (permissions.md, "Allow or deny every
 * fetch"; sandboxing.md): only a `WebFetch(domain:...)` rule adds its domain to a list, and a bare
 * `WebFetch` rule changes nothing there. A wildcard in a position the sandbox does not honor
 * (`example.*`) still matches fetches and adds nothing. `undefined` is "no entry".
 */
export function sandboxDomainEntry(rule: PermissionRule): SandboxDomainEntry | undefined {
  const { specifier } = rule;
  const list = SANDBOX_LIST[rule.behavior];
  if (rule.value.toolName !== 'WebFetch' || specifier?.form !== 'domain' || list === undefined) {
    return undefined;
  }
  const domain = normalize(specifier.pattern);
  return SANDBOX_HONORED.test(domain) ? { list, domain } : undefined;
}

/** The two sandbox lists the `WebFetch(domain:...)` rules in `rules` contribute to. */
export function sandboxDomainLists(rules: readonly PermissionRule[]): {
  readonly allowedDomains: readonly string[];
  readonly deniedDomains: readonly string[];
} {
  const entries = rules.flatMap((rule) => sandboxDomainEntry(rule) ?? []);
  const domains = (list: SandboxList): readonly string[] =>
    entries.filter((entry) => entry.list === list).map((entry) => entry.domain);
  return { allowedDomains: domains('allowed'), deniedDomains: domains('denied') };
}
