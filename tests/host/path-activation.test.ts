/**
 * skills.md, frontmatter reference, `paths`: "When set, Claude loads the skill automatically only when
 * working with files matching the patterns"; until then the listing has its name alone. The session
 * keeps the skills a touched file activated, and `touchFile` says which it activated. Integration tests
 * of the host, outside `spec()`.
 */
import { expect, test } from 'bun:test';
import { hostOf, loaded, SESSION, signal } from '../support/host.ts';

const json = (value: unknown): string => JSON.stringify(value);

async function pathHost() {
  const plugin = await loaded({
    '.claude-plugin/plugin.json': json({ name: 'kit' }),
    'skills/ts/SKILL.md': '---\ndescription: TypeScript rules\npaths: src/**/*.ts\n---\nBody',
    'skills/any/SKILL.md': '---\ndescription: Always\n---\nBody',
  });
  return hostOf({ plugins: [{ id: 'kit@acme', plugin }] });
}

const described = (session: {
  skills(): { model: { entries: readonly { name: string; description?: string }[] } };
}) =>
  session
    .skills()
    .model.entries.filter((entry) => entry.description !== undefined)
    .map((entry) => entry.name)
    .toSorted();

test('a touched file that matches activates the skill for the rest of the session', async () => {
  const { host } = await pathHost();
  const session = host.openSession(SESSION);
  expect(described(session)).toEqual(['kit:any']);
  const miss = await session.touchFile('/work/app/docs/readme.md', { signal: signal() });
  expect(miss.activated).toEqual([]);
  const hit = await session.touchFile('/work/app/src/a/b.ts', { signal: signal() });
  expect(hit.activated).toEqual(['kit:ts']);
  expect(described(session)).toEqual(['kit:any', 'kit:ts']);
  expect(described(session.withTurn({ effort: { level: 'low' } }))).toEqual(['kit:any', 'kit:ts']);
  const again = await session.touchFile('/work/app/src/c.ts', { signal: signal() });
  expect(again.activated).toEqual([]);
});

test('a file outside the working directory activates nothing', async () => {
  const { host } = await pathHost();
  const session = host.openSession(SESSION);
  const outside = await session.touchFile('/work/other/src/a.ts', { signal: signal() });
  expect(outside.activated).toEqual([]);
});
