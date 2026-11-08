import type { HookOrigin } from '../../protocol/mods-events.ts';
import { ENGINE_ORIGIN } from '../../protocol/mods-events.ts';

/** Claude Code itself, or a mod built into it. */
export const isCollectorOrigin = (origin: HookOrigin): boolean =>
  origin.plugin === ENGINE_ORIGIN.plugin || origin.tier === 'builtin';
