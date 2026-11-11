/**
 * Declarations 2.1.321 (AGENTS.md, E2a; plugins/mods/reference.md, the note under the title, and
 * create.md, "Get type definitions for your version": the declarations are the complete reference
 * and win when a page disagrees). The kit's mods surface against `spec/mods-declarations.json`
 * (`bun run types:extract`, compared with the pulled declarations by `check:spec`, SP8): the events
 * and their input and result fields (claude-code/index.d.ts:4053 on), the members of `$` and how
 * each answers (`CoreEngineInterface`, :2369), the fields of `next` and of a `.catch` handler's
 * (`Next`, :6977), the elements of each surface and their props (`Elements`, :4053), the values
 * `claude-code` exports (:16400 on), `claude-code/testing` and the built-in tools' inputs
 * (claude-code-tools). Every difference is either gone or judged (`JUDGED_DIFFERENCES`, a
 * `spec/judgments.md` row each); a declaration is not compatibility, so this is outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JUDGED_DIFFERENCES } from '../../support/declared-differences.ts';
import { DECLARED } from '../../support/mods-declarations.ts';
import {
  apiDifferences,
  elementDifferences,
  eventDifferences,
  eventFieldDifferences,
  moduleDifferences,
  nextDifferences,
  toolDifferences,
} from '../../support/mods-kit-surface.ts';
import {
  opEventDifferences,
  paramDifferences,
  resultDifferences,
} from '../../support/mods-kit-calls.ts';

const JUDGMENTS = readFileSync(join(import.meta.dir, '../../../spec/judgments.md'), 'utf8');
const REQUIREMENTS: unknown = JSON.parse(
  readFileSync(join(import.meta.dir, '../../../spec/requirements.json'), 'utf8'),
);

/** What each call settles with against its declared result; a call whose result could not be read is a difference too. */
async function resultOrUnread(): Promise<string[]> {
  const { lines, unread } = await resultDifferences();
  return [...lines, ...unread.map((line) => `result unread: ${line}`)];
}

async function everyDifference(): Promise<string[]> {
  return [
    ...eventDifferences(),
    ...eventFieldDifferences(),
    ...(await apiDifferences()),
    ...paramDifferences(),
    ...(await opEventDifferences()),
    ...(await resultOrUnread()),
    ...(await nextDifferences()),
    ...elementDifferences(),
    ...moduleDifferences(),
    ...toolDifferences(),
  ];
}

describe('the mods declarations', () => {
  test('are of the release the docs and the SDK are', () => {
    expect(REQUIREMENTS).toMatchObject({ claudeCode: DECLARED.claudeCode });
  });

  test('every difference from the kit is judged, and every judged one still stands', async () => {
    const found = await everyDifference();
    const judged = Object.keys(JUDGED_DIFFERENCES);
    expect(found.filter((line) => !judged.includes(line))).toEqual([]);
    expect(judged.filter((line) => !found.includes(line))).toEqual([]);
  });

  test('each judged difference names a row of spec/judgments.md', () => {
    const rows = [...new Set(Object.values(JUDGED_DIFFERENCES))];
    expect(
      rows.filter((row) => !JUDGMENTS.includes(`**${row}** declarations ${DECLARED.claudeCode}`)),
    ).toEqual([]);
  });
});
