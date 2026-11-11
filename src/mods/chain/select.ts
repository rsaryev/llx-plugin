/** A telemetry event is one under `telemetry.` (`Glob`, claude-code/index.d.ts:5350: "`telemetry.*` for all"). */
const isTelemetry = (event: string): boolean => event.startsWith('telemetry.');

/**
 * Whether `pattern` selects `event` (claude-code/index.d.ts:11516, `Selected`): `*` every event but
 * a telemetry one (`Glob`, :5346), `ns.*` every one under that namespace (`telemetry.*` the
 * telemetry events), `!pattern` every one the pattern does not select and no telemetry event
 * (`Negation`, :6955), a name the one it names. What `next.is` answers and what `on` registers.
 */
export function selects(pattern: string, event: string): boolean {
  if (pattern.startsWith('!')) return !isTelemetry(event) && !selects(pattern.slice(1), event);
  if (pattern === '*') return !isTelemetry(event);
  if (pattern.endsWith('.*')) return event.startsWith(pattern.slice(0, -1));
  return pattern === event;
}
