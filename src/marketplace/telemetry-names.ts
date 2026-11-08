/**
 * The plugin and marketplace names an OpenTelemetry event reports (plugins/security.md, "Find plugins
 * in telemetry"; plugins/measure.md, "Redacted plugin names in your backend"). Pure: the host says
 * whether the plugin is from the official tier and whether `OTEL_LOG_TOOL_DETAILS=1`.
 */

export const TELEMETRY_EVENTS = ['plugin_loaded', 'plugin_installed', 'skill_activated'] as const;
export type TelemetryEvent = (typeof TELEMETRY_EVENTS)[number];

export interface TelemetryNameFacts {
  /** The plugin is from an official-tier marketplace: its names are reported as they are. */
  readonly official: boolean;
  /** `OTEL_LOG_TOOL_DETAILS=1` on the machine that exports. */
  readonly logToolDetails: boolean;
  readonly plugin: string;
  readonly marketplace: string;
}

export interface ReportedNames {
  readonly 'plugin.name'?: string;
  readonly 'marketplace.name'?: string;
}

const REAL = (facts: TelemetryNameFacts): ReportedNames => ({
  'plugin.name': facts.plugin,
  'marketplace.name': facts.marketplace,
});

/** The literal `third-party` replaces the names on `plugin_loaded`. */
const LITERAL = { 'plugin.name': 'third-party', 'marketplace.name': 'third-party' } as const;

/** What a non-official plugin's event reports by default, per event: `plugin_loaded` redacts, the others omit. */
const REDACTED: { readonly [E in TelemetryEvent]: ReportedNames } = {
  plugin_loaded: LITERAL,
  plugin_installed: {},
  skill_activated: {},
};

/** The names the event carries: real for the official tier or with `OTEL_LOG_TOOL_DETAILS=1`, else redacted or omitted. */
export function reportedNames(event: TelemetryEvent, facts: TelemetryNameFacts): ReportedNames {
  return facts.official || facts.logToolDetails ? REAL(facts) : REDACTED[event];
}
