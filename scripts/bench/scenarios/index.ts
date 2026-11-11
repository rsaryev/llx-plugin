/** Every scenario of the meter, in the order it measures them (the order is part of the input). */
import type { Scenario } from './context.ts';
import { FOLDERS } from './folders.ts';
import { HOOKS } from './hooks.ts';
import { LOADING } from './loading.ts';
import { RULES } from './rules.ts';
import { SESSIONS } from './session.ts';
import { SETTINGS } from './settings.ts';

export type { Law, Scenario } from './context.ts';

export const SCENARIOS: readonly Scenario[] = [
  ...LOADING,
  ...SESSIONS,
  ...HOOKS,
  ...RULES,
  ...SETTINGS,
  ...FOLDERS,
];
