import {
  RENDER_SITES,
  type RenderSite,
  type RequestKind,
  type UiSurface,
} from '../../../protocol/mods-ui-names.ts';
import type { Props } from '../elements/node.ts';
import { viewportProblem, type Viewport } from './viewport.ts';

/** Whether `site` is raised in `surface`: the "Rendered on" column of the render sites table. */
export const decideSite = (site: RenderSite, surface: UiSurface): boolean =>
  RENDER_SITES[site].surfaces.includes(surface);

/** What a `ui.render` hook receives as `e` (reference.md, "Render sites"). */
export type RenderEvent = {
  readonly component: RenderSite;
  readonly surface: UiSurface;
  readonly props: Props;
  /** The pane's `id`, the message id, the tool call id or the agent id; absent for a site that has "One instance" (judgment). */
  readonly requestId?: string;
  readonly viewport?: Viewport;
};

export interface RenderRequest {
  readonly site: RenderSite;
  readonly surface: UiSurface;
  readonly props?: Props;
  readonly requestId?: string;
  /** The window as the app measured it; absent until it has. */
  readonly viewport?: Viewport;
}

/** What each kind of `requestId` needs from the request: an `instance` has none. */
const REQUEST_IDS: { readonly [K in RequestKind]: boolean } = {
  'pane-id': true,
  'message-id': true,
  'tool-call-id': true,
  'agent-id': true,
  instance: false,
};

/**
 * The `ui.render` event for one site, or why it is not raised: the site is not drawn in that app,
 * or the request lacks its id or (in the VS Code extension) its viewport. Firing is the host's:
 * the kit builds the event and proves what a hook receives.
 */
export function renderEvent(
  request: RenderRequest,
): { readonly event: RenderEvent } | { readonly problem: string } {
  const { site, surface, viewport } = request;
  const hasId = REQUEST_IDS[RENDER_SITES[site].request];
  const { requestId } = request;
  if (!decideSite(site, surface)) return { problem: `${site} is not raised in the ${surface} app` };
  if (hasId && requestId === undefined) {
    return { problem: `${site} needs a requestId` };
  }
  const missing = viewportProblem(surface, viewport);
  if (missing !== undefined) return { problem: missing };
  return {
    event: {
      component: site,
      surface,
      props: request.props ?? {},
      ...(hasId && requestId !== undefined ? { requestId } : {}),
      ...(viewport === undefined ? {} : { viewport }),
    },
  };
}
