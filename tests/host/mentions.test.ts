import { bodyOf } from '../support/expand.ts';
/**
 * skills.md § Stack several skills in one message ("typing `/write-tests /fix-issue 123` loads both
 * skills and passes the trailing text `123` as `$ARGUMENTS` to each of them"; the first plus up to
 * five more; expansion "stops at the first token that isn't an inline user-invocable skill", a
 * forked skill ends the stack; through `claude -p` only the first skill loads) and § Control who
 * invokes a skill ("Where you write the skill's name": a name after plain text counts as the
 * user's permission for that message, so the model may run a `disable-model-invocation` skill).
 * `session.expandMessage` reads the mentions of one message against the session's catalog and expands
 * them; integration tests of the host, outside `spec()`.
 */
import { describe, expect, test } from 'bun:test';
import type { MessageExpansion } from '../../src/host/index.ts';
import { hostOf, loaded, SESSION, signal } from '../support/host.ts';

const json = (value: unknown): string => JSON.stringify(value);

const skill = (name: string, front = '', body = `${name} gets $ARGUMENTS`): [string, string] => [
  `skills/${name}/SKILL.md`,
  `---\ndescription: ${name}\n${front}\n---\n${body}`,
];

async function stacked(env: Record<string, string> = {}) {
  const files: Record<string, string> = {
    '.claude-plugin/plugin.json': json({ name: 'kit' }),
    ...Object.fromEntries([
      skill('a'),
      skill('b'),
      skill('c'),
      skill('review', 'context: fork'),
      skill('hidden', 'user-invocable: false'),
      skill('release', 'disable-model-invocation: true', 'Release it.'),
      ...['s1', 's2', 's3', 's4', 's5', 's6', 's7'].map((name) => skill(name)),
    ]),
  };
  return hostOf({ plugins: [{ id: 'kit@acme', plugin: await loaded(files) }], env });
}

const texts = (result: MessageExpansion) =>
  result.expansions.map((each) => (each.expansion.ok ? bodyOf(each.expansion.text) : 'failed'));

describe('stacking at the prompt', () => {
  test('/a /b args expands both, each with the shared arguments, in order', async () => {
    const { host } = await stacked();
    const result = await host
      .openSession(SESSION)
      .expandMessage('/kit:a /kit:b 123', { signal: signal() });
    expect(result.mentions.map((m) => [m.how, m.command])).toEqual([
      ['direct', 'kit:a'],
      ['stacked', 'kit:b'],
    ]);
    expect(texts(result)).toEqual(['a gets 123', 'b gets 123']);
  });

  test('a forked skill ends the stack: it and what follows are the arguments of the others', async () => {
    const { host } = await stacked();
    const result = await host
      .openSession(SESSION)
      .expandMessage('/kit:a /kit:review /kit:b 9', { signal: signal() });
    expect(texts(result)).toEqual(['a gets /kit:review /kit:b 9']);
  });

  test('a skill the user cannot invoke ends the stack', async () => {
    const { host } = await stacked();
    const result = await host
      .openSession(SESSION)
      .expandMessage('/kit:a /kit:hidden /kit:b', { signal: signal() });
    expect(texts(result)).toEqual(['a gets /kit:hidden /kit:b']);
  });

  test('an unknown name ends the stack', async () => {
    const { host } = await stacked();
    const result = await host
      .openSession(SESSION)
      .expandMessage('/kit:a /nope x', { signal: signal() });
    expect(texts(result)).toEqual(['a gets /nope x']);
  });

  test('a non-interactive turn expands only the first, the rest of the line is its arguments', async () => {
    const { host } = await stacked();
    const session = host.openSession({ ...SESSION, interactive: false });
    const result = await session.expandMessage('/kit:a /kit:b 123', { signal: signal() });
    expect(texts(result)).toEqual(['a gets /kit:b 123']);
    const turn = host.openSession(SESSION).withTurn({ interactive: false });
    expect(texts(await turn.expandMessage('/kit:a /kit:b 123', { signal: signal() }))).toEqual([
      'a gets /kit:b 123',
    ]);
  });

  test('the first skill plus up to five more: six in all', async () => {
    const { host } = await stacked();
    const message = ['s1', 's2', 's3', 's4', 's5', 's6', 's7'].map((n) => `/kit:${n}`).join(' ');
    const result = await host.openSession(SESSION).expandMessage(`${message} go`, {
      signal: signal(),
    });
    expect(result.expansions).toHaveLength(6);
    expect(texts(result)[5]).toBe('s6 gets /kit:s7 go');
  });

  test('a message that is not a command expands nothing', async () => {
    const { host } = await stacked();
    const result = await host.openSession(SESSION).expandMessage('please fix it', {
      signal: signal(),
    });
    expect(result).toMatchObject({ mentions: [], expansions: [] });
  });

  test('a direct mention the user may not invoke comes back as a failed expansion', async () => {
    const { host } = await stacked();
    const result = await host
      .openSession(SESSION)
      .expandMessage('/kit:hidden now', { signal: signal() });
    expect(result.expansions).toHaveLength(1);
    expect(result.expansions[0]?.expansion.ok).toBe(false);
  });
});

describe('a name after plain text', () => {
  test('is not expanded, and permits the model to run a disable-model-invocation skill in that message', async () => {
    const { host } = await stacked();
    const session = host.openSession(SESSION);
    const message = await session.expandMessage('go ahead and /kit:release please', {
      signal: signal(),
    });
    expect(message.expansions).toEqual([]);
    expect(message.permitted.has('kit:release')).toBe(true);

    const refused = await session.expandSkill('kit:release', {
      signal: signal(),
      invoker: 'model',
    });
    expect(refused.ok).toBe(false);
    const allowed = await session.expandSkill('kit:release', {
      signal: signal(),
      invoker: 'model',
      permittedByMention: message.permitted.has('kit:release'),
    });
    expect(allowed.ok && bodyOf(allowed.text)).toBe('Release it.');
  });

  test('does not permit a skill the message did not name', async () => {
    const { host } = await stacked();
    const session = host.openSession(SESSION);
    const message = await session.expandMessage('go ahead and /kit:a please', { signal: signal() });
    expect(message.permitted.has('kit:release')).toBe(false);
  });

  test('does not lift user-invocable: false for the user', async () => {
    const { host } = await stacked();
    const result = await host.openSession(SESSION).expandSkill('kit:hidden', {
      signal: signal(),
      permittedByMention: true,
    });
    expect(result.ok).toBe(false);
  });
});

async function declared() {
  const files = {
    '.claude-plugin/plugin.json': json({ name: 'kit', skills: ['./extra/one', './extra/two'] }),
    'extra/one/SKILL.md': '---\nname: declared-one\ndescription: d\n---\none gets $ARGUMENTS',
    'extra/two/SKILL.md':
      '---\nname: declared-two\ndescription: d\ndisable-model-invocation: true\n---\ntwo',
  };
  return hostOf({ plugins: [{ id: 'kit@acme', plugin: await loaded(files) }] });
}

describe('every name that invokes a skill', () => {
  test('a plugin skill typed by its bare name expands, as `expandSkill` does', async () => {
    const { host } = await declared();
    const session = host.openSession(SESSION);
    const result = await session.expandMessage('/declared-one now', { signal: signal() });
    expect(texts(result)).toEqual(['one gets now']);
  });

  test('a bare name after plain text permits the skill under its listed command', async () => {
    const { host } = await declared();
    const message = await host
      .openSession(SESSION)
      .expandMessage('go ahead and /declared-two please', { signal: signal() });
    expect(message.permitted.has('kit:declared-two')).toBe(true);
  });

  test('a command the host names as taking a command ends the stack', async () => {
    const { host } = await stacked();
    const result = await host.openSession(SESSION).expandMessage('/kit:a /kit:b /kit:c 5m', {
      signal: signal(),
      takesCommandArguments: new Set(['kit:b']),
    });
    expect(texts(result)).toEqual(['a gets /kit:b /kit:c 5m']);
  });
});

describe('messageMentions: the read expandMessage makes, without expanding', () => {
  test('the stack, its arguments and the permitted skills, as expandMessage sees them', async () => {
    const { host } = await stacked();
    const session = host.openSession(SESSION);
    const message = '/kit:a /kit:b 123 then /kit:release';
    const read = session.messageMentions(message);
    expect(read.leading).toEqual(['kit:a', 'kit:b']);
    expect(read.arguments).toBe('123 then /kit:release');
    expect([...read.permitted]).toEqual(['kit:release']);
    const expanded = await session.expandMessage(message, { signal: signal() });
    expect(expanded.mentions).toEqual(read.mentions);
    expect(expanded.leading).toEqual(read.leading);
    expect([...expanded.permitted]).toEqual([...read.permitted]);
    expect(expanded.expansions.map((each) => each.mention.command)).toEqual([...read.leading]);
  });

  test('a message that names no skill reads as nothing', async () => {
    const { host } = await stacked();
    const read = host.openSession(SESSION).messageMentions('plain text');
    expect(read).toMatchObject({ mentions: [], leading: [], permitted: new Set() });
  });

  test('a command the host names as taking a command ends the stack', async () => {
    const { host } = await stacked();
    const read = host
      .openSession(SESSION)
      .messageMentions('/kit:a /kit:b /kit:c 5m', { takesCommandArguments: new Set(['kit:b']) });
    expect(read).toMatchObject({ leading: ['kit:a'], arguments: '/kit:b /kit:c 5m' });
  });
});
