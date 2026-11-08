import {
  RENDER_SITE_NAMES,
  SURFACES,
  type RenderSite,
  type Surface,
} from '../../protocol/mods-ui-names.ts';
import type { EventRules } from '../types.ts';
import { isRecord } from './elements/node.ts';
import { treeProblem } from './elements/validate.ts';
import { bandProblem } from './sites/band.ts';
import { tableProblem } from './tables.ts';

const isSite = (value: unknown): value is RenderSite =>
  typeof value === 'string' && RENDER_SITE_NAMES.some((site) => site === value);
const isSurface = (value: unknown): value is Surface =>
  typeof value === 'string' && SURFACES.some((surface) => surface === value);

/** The interface events whose answer has a shape: a tree for `ui.render`, an element table for `ui.resolve`. */
type Shaper = (result: unknown, input: unknown, inner: WeakSet<object>) => string | undefined;

const SHAPES: Readonly<Record<string, Shaper>> = {
  'ui.render': (result, input, inner) => {
    if (!isRecord(input) || !isSite(input.component) || !isSurface(input.surface)) return undefined;
    const { component, surface } = input;
    return (
      treeProblem(component, surface, result) ??
      (component === 'AbovePrompt'
        ? bandProblem(
            result,
            (node) => typeof node === 'object' && node !== null && inner.has(node),
          )
        : undefined)
    );
  },
  'ui.resolve': (result) => tableProblem(result),
};

/**
 * `rules` with the shape of what the interface events answer added (reference.md, "Interface"): a
 * `ui.render` hook returns an element tree or the result of `next(e)` and one whose tree does not
 * validate "counts as one that returned the wrong shape" (events.md, "Handle a hook that fails");
 * a `ui.resolve` hook returns an element table. The trees hooks returned are remembered, so a band
 * tree that nests another mod's tree can be checked for the props that would break the band. One set
 * of rules belongs to one chain.
 */
export function withUiRules(rules: EventRules): EventRules {
  const inner = new WeakSet<object>();
  return {
    ...rules,
    shapeProblem: (event, result, answered, input) =>
      Object.hasOwn(SHAPES, event)
        ? SHAPES[event]?.(result, input, inner)
        : rules.shapeProblem(event, result, answered, input),
    settle(event, result) {
      if (event === 'ui.render' && typeof result === 'object' && result !== null) {
        inner.add(result);
      }
      return rules.settle(event, result);
    },
  };
}
