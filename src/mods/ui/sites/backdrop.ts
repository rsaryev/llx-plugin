import { BACKDROP_REQUEST_ID, type UiSurface } from '../../../protocol/mods-ui-names.ts';
import type { SessionBackdrop } from '../../api/ports.ts';
import { renderEvent, type RenderEvent } from './registry.ts';
import type { Viewport } from './viewport.ts';

/**
 * The `ui.render` event of the `Backdrop` site when the Desktop or mobile app asks to draw the
 * session's backdrop (reference.md, "Render sites"; interface.md, "Put a backdrop behind the
 * conversation"): `e.props` holds `id`, `plugin` and, when they were set, `glass` and
 * `colorScheme`, and `e.requestId` is `backdrop`. With no backdrop set there is nothing to draw.
 */
export function backdropRender(
  backdrop: SessionBackdrop | undefined,
  surface: UiSurface,
  viewport?: Viewport,
): { readonly event: RenderEvent } | { readonly problem: string } {
  if (backdrop === undefined) return { problem: 'the session has no backdrop' };
  return renderEvent({
    site: 'Backdrop',
    surface,
    props: { ...backdrop },
    requestId: BACKDROP_REQUEST_ID,
    ...(viewport === undefined ? {} : { viewport }),
  });
}
