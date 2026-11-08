/** What mods and the other layer-4 streams share: time budgets, frozen data, size counters. */
export { createBudget, type Budget, type BudgetOptions } from './budget.ts';
export { deepFreeze, type DeepReadonly } from './freeze.ts';
export { jsonBytes, jsonChars } from './json-size.ts';
export { prefixWithinBytes } from './utf8-prefix.ts';
export { toJsonValue } from './json-value.ts';
export {
  plainDataProblem,
  walkPlainData,
  type JsonObject,
  type JsonValue,
  type PlainDataLimits,
  type PlainDataProblem,
  type PlainDataStats,
} from './plain-data.ts';
