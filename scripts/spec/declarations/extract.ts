/**
 * What the pulled mods declarations declare, as the snapshot `spec/mods-declarations.json` holds it
 * (snapshot.ts), read through the checker (reader.ts). `undefined` when they are not pulled.
 */
import { join } from 'node:path';
import type { Type } from 'typescript/unstable/async';
import { TYPES_DIR } from '../../docs/location.ts';
import { withDeclarations, type Call, type Field, type Reader } from './reader.ts';
import type { Declarations, TypedField } from './snapshot.ts';

const PROBE = `import type * as CC from 'claude-code';
declare const engineEvents: CC.EngineEventOf;
declare const opEvents: CC.OpEventOf;
declare const classicEvents: CC.ClassicEventOf;
declare const results: CC.ResultOf;
declare const api: CC.CoreEngineInterface;
declare const next: CC.Next;
declare const caught: CC.Caught;
declare const elements: CC.Elements;
declare const values: typeof import('claude-code');
declare const testing: typeof import('claude-code/testing');
declare const tools: CC.BuiltinToolInputs;
export {};
`;

/** A union of more variants than this is a union of shapes (`tool.call`, one per tool): only the fields all share are the event's. */
const MANY_VARIANTS = 8;

const byName = <F extends Field>(fields: readonly F[]): F[] =>
  fields.toSorted((a, b) => a.name.localeCompare(b.name));

async function inputFields(reader: Reader, type: Type): Promise<TypedField[]> {
  const shared = (await reader.variants(type)) > MANY_VARIANTS;
  return byName(await reader.typedFields(type, { shared }));
}

/** What a member's declared type says about how it answers. */
function kindOf(calls: readonly Call[]): Declarations['api'][string][string]['kind'] {
  const [first] = calls;
  if (!first) return 'value';
  if (first.returns.startsWith('Promise<')) return 'call';
  if (first.returns.startsWith('HookStream<')) return 'stream';
  return first.returns === 'Timer' ? 'timer' : 'sync';
}

async function eventsOf(reader: Reader): Promise<Declarations['events']> {
  const results = new Map(
    (await reader.members(await reader.named('results'))).map((one) => [one.name, one.type]),
  );
  const named = [
    ...(await reader.members(await reader.named('engineEvents'))),
    ...(await reader.members(await reader.named('opEvents'))),
  ];
  const events: Declarations['events'] = {};
  for (const { name, type, line } of named) {
    const result = results.get(name);
    events[name] = {
      line,
      input: await inputFields(reader, type),
      result: result ? byName(await reader.fields(result)) : [],
    };
  }
  return events;
}

async function apiOf(reader: Reader): Promise<Declarations['api']> {
  const api: Declarations['api'] = {};
  for (const namespace of await reader.members(await reader.named('api'))) {
    const members: Declarations['api'][string] = {};
    for (const { name, type, line } of await reader.members(namespace.type)) {
      const calls = await reader.calls(type);
      members[name] = { line, kind: kindOf(calls), calls };
    }
    api[namespace.name] = members;
  }
  return api;
}

async function elementsOf(reader: Reader): Promise<Pick<Declarations, 'elements' | 'props'>> {
  const elements: Declarations['elements'] = {};
  const props: Declarations['props'] = {};
  for (const surface of await reader.members(await reader.named('elements'))) {
    const table = await reader.members(surface.type);
    elements[surface.name] = table.map((one) => one.name);
    for (const element of table) {
      const accepted = await reader.firstParam(element.type);
      if (accepted && !(element.name in props)) {
        props[element.name] = byName(
          (await reader.fields(accepted)).filter((one) => one.name !== 'children'),
        );
      }
    }
  }
  return { elements, props };
}

async function exportsOf(reader: Reader): Promise<Declarations['exports']> {
  const values: Declarations['exports'] = {};
  for (const { name, type, line } of await reader.members(await reader.named('values'))) {
    values[name] = { line, calls: await reader.calls(type) };
  }
  return values;
}

async function linesOf(reader: Reader, name: string): Promise<Record<string, number>> {
  const members = await reader.members(await reader.named(name));
  return Object.fromEntries(members.map((one) => [one.name, one.line]));
}

async function toolsOf(reader: Reader): Promise<Declarations['tools']> {
  const tools: Declarations['tools'] = {};
  for (const { name, type } of await reader.members(await reader.named('tools'))) {
    tools[name] = byName(await reader.fields(type));
  }
  return tools;
}

const sorted = <T>(record: Readonly<Record<string, T>>): Record<string, T> =>
  Object.fromEntries(Object.entries(record).toSorted(([a], [b]) => a.localeCompare(b)));

/** The snapshot of the pulled declarations, or `undefined` when none are pulled. */
export async function pulledDeclarations(): Promise<Declarations | undefined> {
  const version = Bun.file(join(TYPES_DIR, 'VERSION'));
  if (!(await version.exists())) return undefined;
  return withDeclarations(PROBE, async (reader) => {
    const next = await reader.named('next');
    return {
      claudeCode: (await version.text()).trim(),
      events: sorted(await eventsOf(reader)),
      classicEvents: Object.keys(await linesOf(reader, 'classicEvents')).toSorted(),
      api: await apiOf(reader),
      next: {
        line: await reader.lineOfType(next),
        fields: (await reader.fields(next)).map((one) => one.name),
      },
      caught: (await reader.fields(await reader.named('caught'))).map((one) => one.name),
      ...(await elementsOf(reader)),
      exports: sorted(await exportsOf(reader)),
      testing: sorted(await linesOf(reader, 'testing')),
      tools: sorted(await toolsOf(reader)),
    };
  });
}
