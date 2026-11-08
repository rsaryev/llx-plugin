import type { RenderSite, Surface } from '../../../protocol/mods-ui-names.ts';
import { drawnNode } from '../elements/surface.ts';
import { clipText, sizeProblem } from '../elements/limits.ts';
import {
  isElementNode,
  isEngineRef,
  walkTree,
  type ElementNode,
  type EngineRef,
} from '../elements/node.ts';
import { engineRefs } from '../elements/validate.ts';
import { REQUIRED_ENGINE_REFS } from './ask-question.ts';

/**
 * What a site shows once the chain settled: the tree of a mod (replacing Claude Code's drawing),
 * Claude Code's own drawing (with the props the last `next(e)` gave it), or nothing because the
 * tree was refused.
 */
export type Drawn =
  | { readonly tree: ElementNode }
  | { readonly engine: EngineRef | undefined }
  | { readonly refused: string; readonly line: string };

export interface FoldOptions {
  /** How many loaded mods have a `ui.render` hook for the site: with more than one the refusal line starts `hooks:`. */
  readonly mods?: number;
}

/** The refusal line: `hooks: ui.render (AbovePrompt) refused: deeper than 32; nothing was drawn`. */
const refusal = (site: RenderSite, reason: string, mods: number): string =>
  `${mods > 1 ? 'hooks: ' : ''}ui.render (${site}) refused: ${reason}`;

/**
 * Folds what the `ui.render` chain settled on into what is drawn (interface.md, "Change what
 * Claude Code already draws"): a tree replaces the drawing, `next(e)`'s reference leaves Claude
 * Code's own, and a tree over a size limit is refused. At `AskUserQuestion` the tree "has to hold
 * the reference exactly once ... Otherwise, Claude Code draws its own dialog".
 */
export function foldRender(
  site: RenderSite,
  surface: Surface,
  settled: unknown,
  options: FoldOptions = {},
): Drawn {
  if (isEngineRef(settled)) return { engine: settled };
  if (!isElementNode(settled)) return { engine: undefined };
  const needed = REQUIRED_ENGINE_REFS[site];
  if (needed !== undefined && engineRefs(settled) !== needed) {
    const own = [...walkTree(settled)].map(({ node }) => node).find(isEngineRef);
    return { engine: own };
  }
  const reason = sizeProblem(settled);
  if (reason !== undefined) {
    return { refused: reason, line: refusal(site, reason, options.mods ?? 1) };
  }
  return { tree: drawnNode(surface, clipText(settled)) };
}
