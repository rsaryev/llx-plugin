import { MOD_LIMITS } from '../../../protocol/mods-limits.ts';
import type { UiSurface } from '../../../protocol/mods-ui-names.ts';
import { firstProblem, textOf, type ElementDef } from './def.ts';

export const LINK: ElementDef = {
  name: 'Link',
  props: ['href', 'label'],
  children: 'none',
  check: (props) =>
    firstProblem(
      props.href === undefined ? 'Link needs an href' : undefined,
      textOf('Link', props, 'href', MOD_LIMITS.hrefChars),
      textOf('Link', props, 'label'),
    ),
};

/**
 * Whether `href` is what `url.href` returns, apart from a missing `/` after the host (whatever
 * follows it): `https://example.com?q=1` for `https://example.com/?q=1`.
 */
function isSpelledAsUrl(href: string, url: URL): boolean {
  const rest = href.startsWith(url.origin) ? href.slice(url.origin.length) : undefined;
  const slashed = rest === undefined || rest.startsWith('/') ? href : `${url.origin}/${rest}`;
  return slashed === url.href;
}

/**
 * Whether a `Link` draws as a link. In the terminal always; in the Desktop app and the VS Code
 * extension only when `href` is an `https:` URL or an `http://localhost` one, has no `@`, and is
 * what `new URL(href).href` returns "apart from a missing `/` after the host" (interface.md,
 * "`Link` in the Desktop app and VS Code"). Otherwise it draws as plain text.
 */
export function drawsAsLink(surface: UiSurface, href: string): boolean {
  if (surface === 'terminal') return true;
  if (href.includes('@')) return false;
  const url = URL.canParse(href) ? new URL(href) : undefined;
  if (!url) return false;
  const isSecure = url.protocol === 'https:';
  const isLocal = url.protocol === 'http:' && url.hostname === 'localhost';
  return (isSecure || isLocal) && isSpelledAsUrl(href, url);
}
