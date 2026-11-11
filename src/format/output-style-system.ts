import {
  includeCodingInstructions,
  type PromptKind,
  type StyleSelection,
} from './output-style-select.ts';

/**
 * output-styles.md § How output styles work. The host supplies its private prompt parts; a style
 * replaces only coding-specific instructions unless it opts to keep them, and is appended intact.
 */
export function outputStyleSystem(
  selection: StyleSelection,
  defaults: {
    readonly general: readonly string[];
    readonly coding: readonly string[];
    readonly promptKind?: PromptKind;
  },
): readonly string[] {
  return [
    ...defaults.general,
    ...(includeCodingInstructions(selection, defaults.promptKind ?? 'full') ? defaults.coding : []),
    ...(selection.style ? [selection.style.instructions] : []),
  ];
}
