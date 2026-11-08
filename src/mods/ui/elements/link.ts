import { MOD_LIMITS } from '../../../protocol/mods-limits.ts';
import type { Surface } from '../../../protocol/mods-ui-names.ts';
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
 * Whether a `Link` draws as a link. In the terminal always; in the Desktop app and the VS Code
 * extension only when `href` is an `https:` URL or an `http://localhost` one, has no `@`, and is
 * what `new URL(href).href` returns "apart from a missing `/` after the host" (interface.md,
 * "`Link` in the Desktop app and VS Code"). Otherwise it draws as plain text.
 */
export function drawsAsLink(surface: Surface, href: string): boolean {
  if (surface === 'terminal') return true;
  if (href.includes('@')) return false;
  const url = URL.canParse(href) ? new URL(href) : undefined;
  if (!url) return false;
  const isSecure = url.protocol === 'https:';
  const isLocal = url.protocol === 'http:' && url.hostname === 'localhost';
  if (!isSecure && !isLocal) return false;
  const spelled = url.href;
  // A missing `/` after the host is allowed: `https://example.com` for `https://example.com/`.
  return href === spelled || `${href}/` === spelled;
}
