import { error, type PluginIssue } from '../../format/issues.ts';
import { TELEMETRY_FILTER, type ModTier } from '../../protocol/mods-events.ts';
import type { MatcherEngine } from '../ports.ts';
import type { RegisteredHook } from '../types.ts';
import { acceptsField, compileMatcher, isUnfiltered, type CompiledMatcher } from './matcher.ts';
import { isKnownEvent, isStreamEvent, isTelemetryEvent, isWildcard } from './wildcard.ts';

const at = (event: string): string => `hooks:${event}`;

/** Telemetry events are filtered for every mod except the ones built into Claude Code (judgment: "a mod you install"). */
const NEEDS_TELEMETRY_FILTER: { readonly [T in ModTier]: boolean } = {
  prepend: true,
  user: true,
  append: true,
  builtin: false,
  core: false,
};

const FORM = { true: 'an async generator', false: 'an async function' } as const;

function formProblem(hook: RegisteredHook): PluginIssue | undefined {
  if (isWildcard(hook.event) || !isKnownEvent(hook.event)) return undefined;
  const wanted = isStreamEvent(hook.event);
  if (wanted === hook.isGenerator) return undefined;
  return error(at(hook.event), `on("${hook.event}") takes ${FORM[`${wanted}`]} hook`);
}

function telemetryProblem(hook: RegisteredHook, tier: ModTier): PluginIssue | undefined {
  if (!isTelemetryEvent(hook.event) || !NEEDS_TELEMETRY_FILTER[tier]) return undefined;
  if (acceptsField(hook.matcher, 'to', TELEMETRY_FILTER.to)) return undefined;
  return error(
    at(hook.event),
    `on("${hook.event}") needs the filter { to: '${TELEMETRY_FILTER.to}' }, so it can be told from a hook on every event`,
  );
}

function duplicates(hooks: readonly RegisteredHook[]): PluginIssue[] {
  const seen = new Set<string>();
  const issues: PluginIssue[] = [];
  for (const hook of hooks) {
    if (!isUnfiltered(hook.matcher)) continue;
    if (seen.has(hook.event)) {
      issues.push(
        error(at(hook.event), `on("${hook.event}") is registered twice without a matcher`),
      );
    }
    seen.add(hook.event);
  }
  return issues;
}

/** What registering a module found wrong, and each hook's compiled matcher when all is well. */
export function checkHooks(
  hooks: readonly RegisteredHook[],
  tier: ModTier,
  engine?: MatcherEngine,
): { readonly issues: readonly PluginIssue[]; readonly matchers: readonly CompiledMatcher[] } {
  const issues = [...duplicates(hooks)];
  const matchers: CompiledMatcher[] = [];
  for (const hook of hooks) {
    const found = formProblem(hook) ?? telemetryProblem(hook, tier);
    if (found) issues.push(found);
    const compiled = compileMatcher(hook.matcher, engine);
    if ('test' in compiled) matchers.push(compiled);
    else issues.push(error(at(hook.event), `on("${hook.event}"): ${compiled.problem}`));
  }
  return { issues, matchers };
}
