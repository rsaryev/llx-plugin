import { BRACED_REFERENCE } from './mcp-env.ts';

/**
 * `${user_config.KEY}` references (plugins/manifest-reference.md, "Reference a saved value") and the
 * option keys they name: the one reader every field that substitutes, refuses or checks them uses.
 * A reference is a braced `${...}` whose text starts with `user_config.`; the key is what follows,
 * as written (a bundled server's keys included). Whether the key is a valid option key is
 * `USER_CONFIG_KEY`'s.
 */

/** `userConfig` keys: letters, digits and underscores, not starting with a digit. */
export const USER_CONFIG_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

const PREFIX = 'user_config.';

/** The key of a `user_config.KEY` reference (the text inside `${...}`), or `undefined` for any other. */
export const userConfigKeyIn = (inner: string): string | undefined =>
  inner.startsWith(PREFIX) && inner.length > PREFIX.length ? inner.slice(PREFIX.length) : undefined;

/**
 * The option a reference names when its key is a valid option key (`USER_CONFIG_KEY`), else
 * `undefined`: `${user_config.2fa}` names no option.
 */
export function validOptionKeyIn(inner: string): string | undefined {
  const key = userConfigKeyIn(inner);
  return key !== undefined && USER_CONFIG_KEY.test(key) ? key : undefined;
}

/** The keys `text` references, in order, repeats kept. */
export const userConfigReferences = (text: string): string[] =>
  [...text.matchAll(BRACED_REFERENCE)].flatMap(([, inner]) => {
    const key = userConfigKeyIn(inner ?? '');
    return key === undefined ? [] : [key];
  });

/** `text` with each reference replaced by `replace(key, reference)`; other `${...}` stay as written. */
export const replaceUserConfigReferences = (
  text: string,
  replace: (key: string, reference: string) => string,
): string =>
  text.replace(BRACED_REFERENCE, (reference, inner: string) => {
    const key = userConfigKeyIn(inner);
    return key === undefined ? reference : replace(key, reference);
  });
