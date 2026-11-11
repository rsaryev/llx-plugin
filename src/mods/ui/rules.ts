import {
  RENDER_SITE_NAMES,
  UI_SURFACES,
  type RenderSite,
  type UiSurface,
} from '../../protocol/mods-ui-names.ts';
import type { EventRuleBook } from '../types.ts';
import { treeProblem } from './elements/validate.ts';
import { bandProblem } from './sites/band.ts';
import { tableProblem } from './tables.ts';
import { isRecord } from '../../protocol/is-record.ts';

const isSite = (value: unknown): value is RenderSite =>
  typeof value === 'string' && RENDER_SITE_NAMES.some((site) => site === value);
const isSurface = (value: unknown): value is UiSurface =>
  typeof value === 'string' && UI_SURFACES.some((surface) => surface === value);

/**
 * The rules of the interface events (reference.md, "Interface"): a `ui.render` hook returns an
 * element tree or the result of `next(e)`, and one whose tree does not validate "counts as one that
 * returned the wrong shape" (events.md, "Handle a hook that fails"); a `ui.resolve` hook returns an
 * element table. The trees hooks returned are remembered, so a band tree that nests another mod's
 * tree can be checked for the props that would break the band. One book belongs to one chain.
 */
export function uiRules(): EventRuleBook {
  const inner = new WeakSet<object>();
  const isInner = (node: unknown): boolean =>
    typeof node === 'object' && node !== null && inner.has(node);
  return {
    'ui.render': {
      shapeProblem(result, _answered, input) {
        if (!isRecord(input) || !isSite(input.component) || !isSurface(input.surface)) {
          return undefined;
        }
        const { component, surface } = input;
        return (
          treeProblem(component, surface, result) ??
          (component === 'AbovePrompt' ? bandProblem(result, isInner) : undefined)
        );
      },
      settle(result) {
        if (typeof result === 'object' && result !== null) inner.add(result);
        return result;
      },
    },
    'ui.resolve': { shapeProblem: (result) => tableProblem(result) },
  };
}
