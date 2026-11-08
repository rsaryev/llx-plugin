import type { ElementName, RenderSite, Surface } from '../../src/protocol/mods-ui-names.ts';
import { createEventRules } from '../../src/mods/events/index.ts';
import {
  createModsUi,
  defaultElementTable,
  withUiRules,
  type ElementNode,
  type ModInterface,
  type ModsUi,
  type Props,
} from '../../src/mods/ui/index.ts';
import type { UiEnv } from './mods-api.ts';
import { harness } from './mods-chain.ts';

/** An element made the way a hook makes it, whichever app draws the tree (the terminal's table holds all but `Svg`, the Desktop app's holds it). */
export function node(name: ElementName, props: Props = {}): ElementNode {
  const make = defaultElementTable('terminal')[name] ?? defaultElementTable('desktop')[name];
  if (!make) throw new Error(`no app draws ${name}`);
  return make(props);
}

/** `value` as a record: what a test reads of a field it knows is one. */
export const recordOf = (value: unknown): Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};

export const text = (...children: string[]): ElementNode => node('Text', { children });

/** A chain with the interface rules: what a test of `ui.render` fires events through. */
export const uiChain = () => harness(undefined, withUiRules(createEventRules()));

/** The `ui.render` event Claude Code passes to a hook for `site`. */
export const renderOf = (
  component: RenderSite,
  surface: Surface = 'terminal',
  props: Props = {},
  requestId = 'id-1',
) => ({ component, surface, requestId, props });

/** A host interface that records what it was asked and answers as a test sets it. */
export function fakeInterface(overrides: Partial<ModInterface> = {}) {
  const calls: { readonly name: string; readonly args: readonly unknown[] }[] = [];
  const record =
    <R>(name: string, result: R) =>
    (...args: readonly unknown[]): R => {
      calls.push({ name, args });
      return result;
    };
  const iface: ModInterface = {
    surface: () => 'terminal',
    viewport: () => ({ columns: 200, rows: 50, isFullscreen: true }),
    renderer: () => 'fullscreen',
    origin: () => 'user',
    redraw: record('redraw', undefined),
    isTerminalVisible: () => false,
    status: record('status', undefined),
    log: record('log', undefined),
    notify: record('notify', Promise.resolve({ isSent: true as const, channel: 'kitty' })),
    ask: record('ask', Promise.resolve('Run it')),
    copy: record('copy', Promise.resolve({ isCopied: true })),
    selection: record('selection', Promise.resolve('picked')),
    notice: record('notice', Promise.resolve(undefined)),
    blit: record('blit', Promise.resolve(undefined)),
    focus: record('focus', Promise.resolve(undefined)),
    scroll: record('scroll', Promise.resolve(undefined)),
    ...overrides,
  };
  return { iface, calls };
}

/** The interface part on the chain a harness made, over a host interface: `apiHarness({ rules: withUiRules, ui: uiOver(iface) })`. */
export const uiOver =
  (iface: ModInterface) =>
  (env: UiEnv): ModsUi =>
    createModsUi({ ...env, iface, signal: new AbortController().signal });
