/**
 * skills.md § Skill content lifecycle: "the rendered `SKILL.md` content enters the conversation as
 * a single message and stays there across later turns", "an `allowed-tools` grant clears when you
 * send your next message", "Claude Code does not re-read the skill file on later turns", the note
 * for a re-invocation with identical content and the full content again when it differs, and
 * "Auto-compaction ... re-attaches the most recent invocation of each skill after the summary,
 * keeping the first 5,000 tokens of each. Re-attached skills share a combined budget of 25,000
 * tokens", filled "starting from the most recently invoked skill".
 */
import { describe, expect, test } from 'bun:test';
import {
  EMPTY_LEDGER,
  REATTACH_TOKENS_PER_SKILL,
  REATTACH_TOKENS_TOTAL,
  invokeSkill,
  reattachAfterCompaction,
  startTurn,
  type SkillLedger,
} from '../../src/skills/lifecycle.ts';
import { expandWith, skillFrom, textOf } from '../support/expand.ts';
import { spec } from '../support/spec.ts';

const invoke = (ledger: SkillLedger, command: string, content: string, grants: string[] = []) =>
  invokeSkill(ledger, { command, content, grants });

/** A body of `tokens` tokens at the default four characters to a token. */
const tokens = (count: number, letter = 'x'): string => letter.repeat(count * 4);

spec('skills.behavior.Skill content lifecycle', () => {
  test('the rendered content enters the conversation whole and stays in it across later turns', () => {
    const first = invoke(EMPTY_LEDGER, 'deploy', 'Deploy steps.');
    expect(first.delivery).toEqual({ kind: 'content', text: 'Deploy steps.' });
    const later = startTurn(startTurn(first.ledger));
    expect(later.loaded).toEqual(first.ledger.loaded);
  });

  test('"an allowed-tools grant clears when you send your next message": the content stays, the grant does not', () => {
    const run = invoke(EMPTY_LEDGER, 'commit', 'Commit.', ['Bash(git commit *)']);
    expect(run.ledger.grants).toEqual(['Bash(git commit *)']);
    const next = startTurn(run.ledger);
    expect(next.grants).toEqual([]);
    expect(next.loaded.map((entry) => entry.command)).toEqual(['commit']);
  });

  test('"invoking the skill again re-applies it for that turn", even when only the note is added', () => {
    const run = invoke(EMPTY_LEDGER, 'commit', 'Commit.', ['Bash(git commit *)']);
    const again = invoke(startTurn(run.ledger), 'commit', 'Commit.', ['Bash(git commit *)']);
    expect(again.ledger.grants).toEqual(['Bash(git commit *)']);
  });

  test('the `disallowed-tools` restriction clears at the next message too', () => {
    const run = invokeSkill(EMPTY_LEDGER, {
      command: 'ask-free',
      content: 'No questions.',
      disallowed: ['AskUserQuestion'],
    });
    expect(run.ledger.disallowed).toEqual(['AskUserQuestion']);
    expect(startTurn(run.ledger).disallowed).toEqual([]);
  });

  test('"When Claude re-invokes a skill whose rendered content is identical ... a short note that the skill is already loaded rather than a second copy"', () => {
    const first = invoke(EMPTY_LEDGER, 'deploy', 'Deploy steps.');
    const second = invoke(first.ledger, 'deploy', 'Deploy steps.');
    expect(second.delivery.kind).toBe('already-loaded');
    expect(second.delivery.text.includes('/deploy')).toBe(true);
    expect(second.delivery.text.includes('Deploy steps.')).toBe(false);
    expect(second.ledger.loaded).toHaveLength(1);
  });

  test('"When the rendered content differs, because the arguments changed ... Claude Code appends the full content again"', async () => {
    const skill = skillFrom('', 'Deploy to $ARGUMENTS.');
    const render = async (typed: string) =>
      textOf((await expandWith(skill, { request: { arguments: typed } })).expansion);
    const first = invoke(EMPTY_LEDGER, skill.command, await render('staging'));
    const same = invoke(first.ledger, skill.command, await render('staging'));
    const changed = invoke(same.ledger, skill.command, await render('prod'));
    expect(same.delivery.kind).toBe('already-loaded');
    expect(changed.delivery).toEqual({ kind: 'content', text: 'Deploy to prod.' });
    expect(changed.ledger.loaded.map((entry) => entry.content)).toEqual([
      'Deploy to staging.',
      'Deploy to prod.',
    ]);
  });

  test('"or a dynamic context command produced new output": the same file renders differently, so the full content comes again', async () => {
    const skill = skillFrom('', 'Branch: !`git branch --show-current`');
    const render = async (branch: string) =>
      textOf(
        (
          await expandWith(skill, {
            permissions: () => 'allow',
            replies: [{ stdout: branch }],
          })
        ).expansion,
      );
    const first = invoke(EMPTY_LEDGER, skill.command, await render('main'));
    const second = invoke(first.ledger, skill.command, await render('feature'));
    expect(second.delivery).toEqual({ kind: 'content', text: 'Branch: feature' });
  });

  test('"Claude Code does not re-read the skill file on later turns": an edit shows only in the next invocation, and the old copy stays', async () => {
    const before = textOf((await expandWith(skillFrom('', 'Old steps.'))).expansion);
    const after = textOf((await expandWith(skillFrom('', 'New steps.'))).expansion);
    const first = invoke(EMPTY_LEDGER, 'pr-summary', before);
    expect(startTurn(first.ledger).loaded[0]?.content).toBe('Old steps.');
    const reinvoked = invoke(first.ledger, 'pr-summary', after);
    expect(reinvoked.delivery).toEqual({ kind: 'content', text: 'New steps.' });
    expect(reinvoked.ledger.loaded.map((entry) => entry.content)).toEqual([
      'Old steps.',
      'New steps.',
    ]);
  });
});

describe('after auto-compaction', () => {
  spec('skills.behavior.Skill content lifecycle', () => {
    test('"re-attaches the most recent invocation of each skill": an older copy of the same skill is not carried', () => {
      let ledger = invoke(EMPTY_LEDGER, 'deploy', 'old').ledger;
      ledger = invoke(ledger, 'lint', 'lint rules').ledger;
      ledger = invoke(ledger, 'deploy', 'new').ledger;
      const kept = reattachAfterCompaction(ledger);
      expect(kept.map((entry) => [entry.command, entry.content])).toEqual([
        ['lint', 'lint rules'],
        ['deploy', 'new'],
      ]);
    });

    test('"keeping the first 5,000 tokens of each"', () => {
      expect(REATTACH_TOKENS_PER_SKILL).toBe(5_000);
      const body = `${tokens(5_000, 'a')}${tokens(10, 'b')}`;
      const [kept] = reattachAfterCompaction(invoke(EMPTY_LEDGER, 'big', body).ledger);
      expect(kept?.content).toBe(tokens(5_000, 'a'));
    });

    test('"Re-attached skills share a combined budget of 25,000 tokens", filled from the most recently invoked skill: older skills can be dropped entirely', () => {
      expect(REATTACH_TOKENS_TOTAL).toBe(25_000);
      let ledger = EMPTY_LEDGER;
      for (const name of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
        ledger = invoke(ledger, name, tokens(5_000, name)).ledger;
      }
      const kept = reattachAfterCompaction(ledger);
      // seven skills of 5,000 tokens: the five newest fit, the two oldest are gone
      expect(kept.map((entry) => entry.command)).toEqual(['c', 'd', 'e', 'f', 'g']);
    });

    test('a skill re-invoked with the same content counts as the most recent one', () => {
      let ledger = invoke(EMPTY_LEDGER, 'a', tokens(5_000, 'a')).ledger;
      for (const name of ['b', 'c', 'd', 'e', 'f']) {
        ledger = invoke(ledger, name, tokens(5_000, name)).ledger;
      }
      ledger = invoke(ledger, 'a', tokens(5_000, 'a')).ledger;
      expect(reattachAfterCompaction(ledger).map((entry) => entry.command)).toEqual([
        'c',
        'd',
        'e',
        'f',
        'a',
      ]);
    });

    test('small skills all fit; the order returned is the order invoked', () => {
      let ledger = EMPTY_LEDGER;
      for (const name of ['a', 'b', 'c']) ledger = invoke(ledger, name, `${name} body`).ledger;
      expect(reattachAfterCompaction(ledger).map((entry) => entry.command)).toEqual([
        'a',
        'b',
        'c',
      ]);
    });
  });

  test('judgment: a host tokenizer replaces the four-characters-to-a-token count', () => {
    const words = {
      count: (text: string) => text.split(' ').length,
      head: (text: string, count: number) => text.split(' ').slice(0, count).join(' '),
    };
    const ledger = invoke(EMPTY_LEDGER, 'a', 'one two three four').ledger;
    const [kept] = reattachAfterCompaction(ledger, { perSkillTokens: 2, tokens: words });
    expect(kept?.content).toBe('one two');
  });

  test('judgment: a skill that no longer fits is dropped whole, and so is every older one', () => {
    let ledger = invoke(EMPTY_LEDGER, 'old-small', 'tiny').ledger;
    ledger = invoke(ledger, 'big', tokens(4_000)).ledger;
    ledger = invoke(ledger, 'newest', tokens(4_000)).ledger;
    const kept = reattachAfterCompaction(ledger, { totalTokens: 5_000 });
    expect(kept.map((entry) => entry.command)).toEqual(['newest']);
  });
});
