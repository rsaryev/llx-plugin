/**
 * skills.md § Angle brackets in a skill description show as `&lt;` and `&gt;`: Claude Code displays
 * `<` and `>` in the `description` and `when_to_use` fields as `&lt;` and `&gt;`; square brackets
 * and `argument-hint` show a placeholder as typed.
 */
import { expect, test } from 'bun:test';
import { menuEntries, modelListing } from '../../src/skills/listing.ts';
import { skillWith } from '../support/skills.ts';
import { spec } from '../support/spec.ts';

const described = (name: string, description: string, extra = '') =>
  skillWith(`name: ${name}\ndescription: ${JSON.stringify(description)}\n${extra}`, { name });
const listed = (skills: Parameters<typeof modelListing>[0]) => modelListing(skills).entries;

spec('skills.behavior.Angle brackets in a skill description show as &lt; and &gt;', () => {
  test('"displays < and > in the description ... as &lt; and &gt;" in the listing the model reads', () => {
    const entry = listed([described('deploy', 'Deploy <branch> to <env>')])[0];
    expect(entry?.description).toBe('Deploy &lt;branch&gt; to &lt;env&gt;');
  });

  test('... and in `when_to_use`, the other field the listing carries', () => {
    const skill = described('deploy', 'Deploy.', 'when_to_use: "Use for <branch> names."');
    expect(listed([skill])[0]?.description).toBe('Deploy. Use for &lt;branch&gt; names.');
  });

  test('"Square brackets: replace <branch> with [branch], which displays as typed"', () => {
    expect(listed([described('deploy', 'Deploy [branch]')])[0]?.description).toBe(
      'Deploy [branch]',
    );
  });

  test('the `/` menu row shows the same escaping', () => {
    expect(menuEntries([described('deploy', 'Deploy <branch>')])[0]?.description).toBe(
      'Deploy &lt;branch&gt;',
    );
  });

  test('"argument-hint: move the placeholder to a new `argument-hint: <branch>` line. It shows after the command name", as written', () => {
    const skill = described('deploy', 'Deploy a branch.', 'argument-hint: "<branch>"');
    const [row] = menuEntries([skill]);
    expect(row).toMatchObject({
      name: 'deploy',
      description: 'Deploy a branch.',
      argumentHint: '<branch>',
    });
  });

  test('judgment: only < and > are escaped; & is left alone', () => {
    expect(listed([described('a', 'Fish &amp; chips')])[0]?.description).toBe('Fish &amp; chips');
    expect(listed([described('b', 'Tom & Jerry')])[0]?.description).toBe('Tom & Jerry');
  });

  test('judgment: an input already holding &lt; keeps it, so it displays as written', () => {
    expect(listed([described('a', 'Use &lt;branch&gt; or <env>')])[0]?.description).toBe(
      'Use &lt;branch&gt; or &lt;env&gt;',
    );
  });
});
