/**
 * The hooks that can refuse an action, which `claude plugin validate` reports with or without a
 * `.catch` handler (create.md: "one line for each hook that can refuse an action, such as
 * `gating hook without .catch: tool.call`"). The docs name these five where they describe the
 * handler (events.md, "Handle a hook that fails"): judgment that no other event is gating.
 */
export const GATING_EVENTS: ReadonlySet<string> = new Set([
  'tool.call',
  'tool.check',
  'prompt.submit',
  'config.set',
  'plugin.register',
]);
