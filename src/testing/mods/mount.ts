import {
  isElementNode,
  routeControl,
  foldRender,
  renderEvent,
  type ElementNode,
} from '../../mods/ui/index.ts';
import { walkTree } from '../../mods/ui/elements/node.ts';
import type { RenderSite, Surface } from '../../protocol/mods-ui-names.ts';
import type { World } from './world.ts';

/**
 * `$.ui.mount` of the test kit (plugins/mods/test.md, "Test a drawing"): it draws one of the mod's
 * render sites through its `ui.render` hook and returns a handle to press, type into, pick in and
 * find the elements it drew, by the `key` the mod gave them. It checks nothing about how an app paints
 * a tree: the tree is the element data the hook returned.
 */
export interface MountSpec {
  readonly plugin?: string;
  readonly component: RenderSite;
  readonly surface: Surface;
  readonly requestId?: string;
  readonly viewport?: {
    readonly columns: number;
    readonly rows: number;
    readonly isFullscreen?: boolean;
  };
  readonly props?: Readonly<Record<string, unknown>>;
}

export interface FindQuery {
  readonly key?: string;
  readonly type?: string;
  /** The element's text, which a string must equal and a regular expression must match. */
  readonly text?: string | RegExp;
}

export interface MountHandle {
  press(target: { readonly key: string }): Promise<void>;
  input(target: {
    readonly key: string;
    readonly text: string;
    readonly kind?: 'change';
  }): Promise<void>;
  select(target: { readonly key: string; readonly value: string }): Promise<void>;
  find(
    query: FindQuery,
  ): Promise<
    { readonly type: string; readonly props: unknown; readonly children: unknown } | undefined
  >;
  unmount(): Promise<void>;
}

/** The text an element holds: its string children, and those of the elements inside it. */
function textOf(node: ElementNode): string {
  return node.children
    .map((child) => (typeof child === 'string' ? child : isElementNode(child) ? textOf(child) : ''))
    .join('');
}

function matches(node: ElementNode, query: FindQuery): boolean {
  if (query.key !== undefined && node.props.key !== query.key) return false;
  if (query.type !== undefined && node.type !== query.type) return false;
  if (query.text === undefined) return true;
  const text = textOf(node);
  return typeof query.text === 'string' ? text === query.text : query.text.test(text);
}

/** The first element of the tree that fits the query, in document order. */
function findIn(tree: ElementNode | undefined, query: FindQuery): ElementNode | undefined {
  if (!tree) return undefined;
  for (const { node } of walkTree(tree)) {
    if (isElementNode(node) && matches(node, query)) return node;
  }
  return undefined;
}

export async function mountUi(world: World, spec: MountSpec): Promise<MountHandle> {
  await world.ensure();
  const host = world.host();
  const request = {
    site: spec.component,
    surface: spec.surface,
    ...(spec.props === undefined ? {} : { props: spec.props }),
    ...(spec.requestId === undefined ? {} : { requestId: spec.requestId }),
    ...(spec.viewport === undefined ? {} : { viewport: { isFullscreen: false, ...spec.viewport } }),
  };
  const built = renderEvent(request);
  if ('problem' in built) throw new Error(built.problem);
  let tree: ElementNode | undefined;
  const draw = async (): Promise<void> => {
    world.needsRedraw = false;
    const settled = await host.fire('ui.render', built.event, {
      core: (e) => world.answer('ui.render', e) as Promise<unknown>,
    });
    const drawn = foldRender(request.site, request.surface, settled);
    if ('refused' in drawn) throw new Error(drawn.line);
    tree = 'tree' in drawn ? drawn.tree : undefined;
  };
  await draw();
  const signal = new AbortController().signal;
  const gesture = async (
    kind: 'press' | 'submit' | 'change' | 'select',
    key: string,
    value?: unknown,
  ) => {
    const routed = await routeControl(
      {
        chain: host.chain,
        tree,
        surface: spec.surface,
        signal,
        report: (report) => world.reports.push(report),
      },
      kind,
      key,
      value,
    );
    const [first] = routed.issues;
    if (first) throw new Error(first.message);
    await draw();
  };
  return {
    press: ({ key }) => gesture('press', key),
    input: ({ key, text, kind }) => gesture(kind ?? 'submit', key, text),
    select: ({ key, value }) => gesture('select', key, value),
    async find(query) {
      if (world.needsRedraw) await draw();
      return findIn(tree, query);
    },
    unmount: () => {
      tree = undefined;
      return Promise.resolve();
    },
  };
}
