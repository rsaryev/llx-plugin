import type { RenderSite } from '../../../protocol/mods-ui-names.ts';

/**
 * How many times a tree must hold Claude Code's own drawing at a site that requires it: the
 * question dialog "has to hold the reference exactly once, with your elements above it" (interface.md,
 * "Change what Claude Code already draws"). Every other site has no such rule.
 */
export const REQUIRED_ENGINE_REFS: Partial<Record<RenderSite, number>> = { AskUserQuestion: 1 };
