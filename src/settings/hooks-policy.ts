import type { HooksSettings } from '../protocol/hook-config.ts';
import { mergeHookSettings } from './hooks-merge.ts';
import { holdersOf, type PolicyLayer } from './layers.ts';

/** The hooks every settings layer defines, combined; empty when no layer sets any. */
export const mergeSettingsHooks = (layers: readonly PolicyLayer[]): HooksSettings =>
  mergeHookSettings(holdersOf(layers, 'hooks').map((holder) => holder.value));
