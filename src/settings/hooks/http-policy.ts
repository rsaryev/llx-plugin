import type { PolicyView } from '../view.ts';
import { matchUrlPattern } from './url-pattern.ts';

/**
 * The two allowlists of HTTP hooks (settings-reference.md, `allowedHttpHookUrls` and
 * `httpHookAllowedEnvVars`). Both merge across files, both are read from "hooks from every source,
 * including managed settings", so the check takes a URL and a hook's own list and no origin.
 */
export type HttpHookVerdict =
  | { readonly run: true; readonly interpolate: readonly string[] }
  | { readonly run: false; readonly message: string };

export interface HttpHookPolicy {
  /**
   * Whether an HTTP hook runs, and which environment variables its headers may interpolate.
   * `hookAllowedEnvVars` is the hook's own `allowedEnvVars`.
   */
  check(url: string, hookAllowedEnvVars: readonly string[]): HttpHookVerdict;
}

/**
 * Judgment (spec/judgments.md): the docs say "blocks the rest without running them" and give no
 * text. The message names the key and not the URL, which can carry a token.
 */
const BLOCKED_MESSAGE =
  'HTTP hook blocked: its URL matches no pattern in allowedHttpHookUrls, so the hook did not run';

const unique = (names: readonly string[]): readonly string[] => [...new Set(names)];

export function createHttpHookPolicy(view: PolicyView): HttpHookPolicy {
  const urls = view.get('allowedHttpHookUrls');
  const variables = view.get('httpHookAllowedEnvVars');
  return {
    check: (url, hookAllowedEnvVars) => {
      if (urls !== undefined && !urls.some((pattern) => matchUrlPattern(pattern, url))) {
        return { run: false, message: BLOCKED_MESSAGE };
      }
      // A hook can use a variable only if both its own list and the key name it.
      const interpolate = unique(hookAllowedEnvVars).filter(
        (name) => variables === undefined || variables.includes(name),
      );
      return { run: true, interpolate };
    },
  };
}
