/** What mods and the other layer-4 streams share: time budgets, frozen data, size counters. */
export { createBudget, type Budget, type BudgetOptions } from './budget.ts';
export { deepFreeze, frozenCopy, type DeepReadonly } from './freeze.ts';
export { jsonBytes, jsonChars } from './json-size.ts';
export { toJsonValue } from './json-value.ts';
export { runEach } from './run-each.ts';
export {
  plainDataProblem,
  walkPlainData,
  type JsonObject,
  type JsonValue,
  type PlainDataLimits,
  type PlainDataProblem,
} from './plain-data.ts';
