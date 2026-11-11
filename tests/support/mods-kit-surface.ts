import { describeApi } from '../../src/mods/api/index.ts';
import { STATE_LIBRARY_SOURCE } from '../../src/mods/api/state-library-source.ts';
import { EVENT_SPECS } from '../../src/mods/events/index.ts';
import { ELEMENT_DEFS } from '../../src/mods/ui/elements/registry.ts';
import { uiRules } from '../../src/mods/ui/index.ts';
import { createTestKit } from '../../src/testing/mods/kit.ts';
import {
  API_EVENT_NAMES,
  CLASSIC_EVENT_NAMES,
  ENGINE_EVENT_NAMES,
} from '../../src/protocol/mods-events.ts';
import {
  ELEMENT_COLUMN_OF,
  ELEMENT_NAMES,
  ELEMENT_SURFACES,
  UI_SURFACES,
} from '../../src/protocol/mods-ui-names.ts';
import { apiHarness } from './mods-api.ts';
import { fn, harness } from './mods-chain.ts';
import { DECLARED, fieldDifferences, nameDifferences, zodFields } from './mods-declarations.ts';
import { fakeInterface, uiOver } from './mods-ui.ts';
import { TOOL_TABLE } from './tool-table.ts';

/**
 * Every difference between the kit's mods surface and the declarations (AGENTS.md, E2a), one line
 * each, by part: the events, their fields, `$`, `next`, the elements, the values `claude-code`
 * exports, `claude-code/testing` and the built-in tools.
 */

export function eventDifferences(): string[] {
  const kit = [...ENGINE_EVENT_NAMES, ...API_EVENT_NAMES];
  return [
    ...nameDifferences('event', kit, Object.keys(DECLARED.events)),
    ...nameDifferences('event', CLASSIC_EVENT_NAMES, DECLARED.classicEvents),
  ];
}

export function eventFieldDifferences(): string[] {
  return Object.entries(EVENT_SPECS).flatMap(([event, spec]) => {
    const declared = DECLARED.events[event];
    if (!declared) return [];
    return [
      ...fieldDifferences(`event ${event} input`, zodFields(spec.input), declared.input),
      ...fieldDifferences(`event ${event} result`, zodFields(spec.result), declared.result),
    ];
  });
}

export async function apiDifferences(): Promise<string[]> {
  const { iface } = fakeInterface();
  const { api } = await apiHarness({ rules: uiRules, ui: uiOver(iface) });
  const described = describeApi(api);
  const lines: string[] = [];
  const namespaces = new Set([...described.map((one) => one.name), ...Object.keys(DECLARED.api)]);
  for (const namespace of namespaces) {
    const ours = described.find((one) => one.name === namespace)?.members ?? [];
    const theirs = DECLARED.api[namespace] ?? {};
    lines.push(
      ...nameDifferences(
        `$.${namespace}`,
        ours.map((one) => one.name),
        Object.keys(theirs),
      ),
    );
    for (const member of ours) {
      const kind = theirs[member.name]?.kind;
      if (kind && kind !== member.kind) {
        lines.push(
          `$.${namespace} ${member.name}: answers as a ${member.kind}, declared a ${kind}`,
        );
      }
    }
  }
  return lines;
}

/** The fields of the `next` a hook receives, and those only a `.catch` handler's has. */
async function kitNextFields(): Promise<{ next: string[]; caught: string[] }> {
  const h = harness();
  const seen: { next: string[]; caught: string[] } = { next: [], caught: [] };
  h.mod('probe', 'user', [
    fn(
      'tool.call',
      (_$, _e, next) => {
        seen.next = Object.keys(next);
        throw new Error('to the handler');
      },
      {
        handler: (_$, e, next) => {
          seen.caught = Object.keys(next).filter((name) => !seen.next.includes(name));
          return next(e);
        },
      },
    ),
  ]);
  await h.fire('tool.call', { tool: 'Bash' });
  return seen;
}

export async function nextDifferences(): Promise<string[]> {
  const { next, caught } = await kitNextFields();
  return [
    ...nameDifferences('next', next, DECLARED.next.fields),
    ...nameDifferences('catch next', caught, DECLARED.caught),
  ];
}

export function elementDifferences(): string[] {
  const lines: string[] = [];
  for (const surface of UI_SURFACES) {
    const column = ELEMENT_COLUMN_OF[surface];
    const ours = ELEMENT_NAMES.filter((name) => ELEMENT_SURFACES[name].includes(column));
    lines.push(
      ...nameDifferences(`elements of ${surface}`, ours, DECLARED.elements[surface] ?? []),
    );
  }
  for (const name of ELEMENT_NAMES) {
    const declared = DECLARED.props[name] ?? [];
    lines.push(
      ...nameDifferences(
        `${name} prop`,
        ELEMENT_DEFS[name].props,
        declared.map((one) => one.name),
      ),
    );
  }
  return lines;
}

/** The values the kit's `claude-code` module exports (`STATE_LIBRARY_SOURCE`). */
const kitExports = (): string[] =>
  [...STATE_LIBRARY_SOURCE.matchAll(/^export const (\w+)/gm)].flatMap((match) => match[1] ?? []);

export function moduleDifferences(): string[] {
  const kit = createTestKit();
  const testing = Object.keys(kit).filter((name) => !['cases', 'tierName'].includes(name));
  return [
    ...nameDifferences('claude-code export', kitExports(), Object.keys(DECLARED.exports)),
    ...nameDifferences('claude-code/testing export', testing, Object.keys(DECLARED.testing)),
  ];
}

/** The inputs the tools table calls each tool with, against that tool's declared input. */
export function toolDifferences(): string[] {
  return TOOL_TABLE.flatMap((row) => {
    const declared = DECLARED.tools[row.tool];
    if (!declared) return [`tool ${row.tool}: in the tools table, not declared`];
    const input = Object(row.input);
    return Object.keys(input)
      .filter((name) => !declared.some((one) => one.name === name))
      .map((name) => `tool ${row.tool} input ${name}: used by the kit, not declared`);
  });
}
