/** Helpers for the customization tests: a policy over sources of settings, and the origins a host reports. */
import {
  createCustomizationPolicy,
  type CustomizationPolicy,
} from '../../src/settings/customization/index.ts';
import type { ParentSettingsContext } from '../../src/settings/managed/index.ts';
import { viewOf, type Source } from './plugin-settings.ts';

const plainMachine: ParentSettingsContext = { hasManagedSettings: false, parentMerge: false };

/** The customization policy the kit makes of the sources, in the order given. */
export const customizationOf = (
  sources: readonly Source[],
  context: Partial<ParentSettingsContext> = {},
): CustomizationPolicy =>
  createCustomizationPolicy(viewOf(...sources), { ...plainMachine, ...context });

/** Managed settings holding the lock, as an administrator writes it. */
export const locking = (value: unknown): readonly Source[] => [
  ['managed', { strictPluginOnlyCustomization: value }],
];
