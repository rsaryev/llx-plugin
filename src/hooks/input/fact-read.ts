/**
 * Reads one field of an event's facts, for the rules that depend on one (`source`, `tool_name`,
 * `prompt`, `agent_id`). Only the facts' own fields count, never one inherited through the
 * prototype.
 */
export const factOf = (facts: object, key: string): unknown =>
  Object.entries(facts).find(([name]) => name === key)?.[1];

/** A fact that is a string; any other value reads as absent. */
export const textFactOf = (facts: object, key: string): string | undefined => {
  const found = factOf(facts, key);
  return typeof found === 'string' ? found : undefined;
};
