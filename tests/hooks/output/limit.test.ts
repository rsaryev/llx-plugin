/**
 * The 10,000-character cap: hooks.md § "JSON output" (scope, "Over the limit", "Reading the file")
 * and § "PreCompact output". The docs name the cap, the file in the session directory and the
 * 2,000-character preview; the file's name and the wording that points to it are the kit's
 * judgments (spec/judgments.md). The cap is cited by the ids of the fields it covers.
 */
import { describe, expect, test } from 'bun:test';
import {
  createOutputStage,
  createHookEngine,
  createHookRegistry,
} from '../../../src/hooks/index.ts';
import type { TaggedOutput } from '../../../src/hooks/index.ts';
import type { ScratchFiles } from '../../../src/ports/scratch-files.ts';
import { entry, FACTS, session } from '../../support/hooks-select.ts';
import { taggedFrom } from '../../support/hooks-output.ts';
import { fakeEnvironment, locations, memoryScratch, scriptedRunner } from '../../support/ports.ts';
import { spec } from '../../support/spec.ts';
import { PREVIEW_LENGTH, TEXT_CAP } from '../../../src/hooks/output/text-cap.ts';

const signal = new AbortController().signal;
const over = (length = TEXT_CAP + 1, char = 'x') => char.repeat(length);

async function limit(
  event: Parameters<typeof taggedFrom>[0],
  printed: readonly unknown[],
  scratch?: ScratchFiles,
) {
  const stage = createOutputStage(scratch === undefined ? {} : { scratch });
  const result = await stage.limit(event, taggedFrom(event, printed), signal);
  return result;
}

const context = (outputs: readonly TaggedOutput[]) => {
  const first = outputs[0]?.output;
  return first !== undefined &&
    'hookSpecificOutput' in first &&
    typeof first.hookSpecificOutput === 'object'
    ? first.hookSpecificOutput
    : undefined;
};

const specificText = (outputs: readonly TaggedOutput[], key: string): unknown => {
  const found = context(outputs);
  return found === undefined || found === null
    ? undefined
    : Object.entries(found).find(([name]) => name === key)?.[1];
};

describe('the cap on additionalContext', () => {
  spec('hooks.output.PostToolUse.additionalContext', () => {
    test('a string at the cap is kept whole', async () => {
      const scratch = memoryScratch();
      const text = over(TEXT_CAP);
      const { outputs } = await limit(
        'PostToolUse',
        [{ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: text } }],
        scratch,
      );
      expect(specificText(outputs, 'additionalContext')).toBe(text);
      expect(scratch.files.size).toBe(0);
    });

    test('a string over the cap is saved to a file; the model gets the path and a 2,000-character preview', async () => {
      const scratch = memoryScratch('/session');
      const text = over(TEXT_CAP + 500, 'a');
      const { outputs, issues } = await limit(
        'PostToolUse',
        [{ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: text } }],
        scratch,
      );
      const given = String(specificText(outputs, 'additionalContext'));
      expect(scratch.files.size).toBe(1);
      const [path, saved] = [...scratch.files.entries()][0] ?? ['', ''];
      expect(saved).toBe(text);
      expect(path.startsWith('/session/')).toBe(true);
      expect(given).toContain(path);
      expect(given).toContain('a'.repeat(PREVIEW_LENGTH));
      expect(given).not.toContain('a'.repeat(PREVIEW_LENGTH + 1));
      expect(issues).toEqual([]);
    });

    test('each string is measured on its own, even when several hooks run for the same event', async () => {
      const scratch = memoryScratch();
      const each = over(TEXT_CAP - 100);
      const printed = [
        { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: each } },
        { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: each } },
      ];
      const { outputs } = await limit('PostToolUse', printed, scratch);
      expect(scratch.files.size).toBe(0);
      expect(outputs).toHaveLength(2);
    });

    test('the name of the saved file carries the event, the hook and the field (judgment)', async () => {
      const scratch = memoryScratch();
      const tagged = taggedFrom('PostToolUse', [
        { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: over() } },
      ]);
      await createOutputStage({ scratch }).limit('PostToolUse', tagged, signal);
      const [path] = [...scratch.files.keys()];
      expect(path).toContain('PostToolUse');
      expect(path).toContain(tagged[0]?.handler.id ?? 'missing');
      expect(path).toContain('additionalContext');
    });
  });
});

describe('the cap on the other strings', () => {
  spec('hooks.output.SessionStart.initialUserMessage', () => {
    test('initialUserMessage over the cap is saved to a file like additionalContext', async () => {
      const scratch = memoryScratch();
      const { outputs } = await limit(
        'SessionStart',
        [{ hookSpecificOutput: { hookEventName: 'SessionStart', initialUserMessage: over() } }],
        scratch,
      );
      expect(scratch.files.size).toBe(1);
      expect(String(specificText(outputs, 'initialUserMessage'))).toContain('Full output saved to');
    });
  });

  test('systemMessage over the cap is saved to a file', async () => {
    const scratch = memoryScratch();
    const { outputs } = await limit('PostToolUse', [{ systemMessage: over() }], scratch);
    expect(scratch.files.size).toBe(1);
    const first = outputs[0]?.output;
    expect(
      first !== undefined &&
        'systemMessage' in first &&
        first.systemMessage.includes('Full output saved to'),
    ).toBe(true);
  });

  test('plain stdout is measured whole and saved to a file when over the cap', async () => {
    const scratch = memoryScratch();
    const { outputs } = await limit(
      'UserPromptSubmit',
      [{ plain: { text: over(), as: 'context' } }],
      scratch,
    );
    expect(scratch.files.size).toBe(1);
    expect(outputs[0]?.plainText?.text).toContain('Full output saved to');
  });

  test('PreCompact stdout is the exception: it is cut at the cap with a marker, and nothing is saved', async () => {
    const scratch = memoryScratch();
    const { outputs } = await limit(
      'PreCompact',
      [{ plain: { text: over(TEXT_CAP + 50), as: 'compaction-instructions' } }],
      scratch,
    );
    const text = outputs[0]?.plainText?.text ?? '';
    expect(scratch.files.size).toBe(0);
    expect(text.startsWith(over(TEXT_CAP))).toBe(true);
    expect(text.length).toBeGreaterThan(TEXT_CAP);
    expect(text.length).toBeLessThan(TEXT_CAP + 100);
  });

  test('characters count as code points: a cut never splits an emoji', async () => {
    const scratch = memoryScratch();
    const { outputs } = await limit(
      'PreCompact',
      [{ plain: { text: over(TEXT_CAP + 5, '😀'), as: 'compaction-instructions' } }],
      scratch,
    );
    const text = outputs[0]?.plainText?.text ?? '';
    expect(text.startsWith('😀'.repeat(TEXT_CAP))).toBe(true);
    expect(/\p{Surrogate}/u.test(text)).toBe(false);
  });
});

describe('a host with no place to save a file (judgment)', () => {
  test('the text is cut at the cap and a warning says why', async () => {
    const { outputs, issues } = await limit('PostToolUse', [
      {
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: over(TEXT_CAP + 10),
        },
      },
    ]);
    expect(String(specificText(outputs, 'additionalContext')).startsWith(over(TEXT_CAP))).toBe(
      true,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe('warning');
    expect(issues[0]?.message).toContain('ScratchFiles');
  });

  test('a port that fails to write falls back to the same cut', async () => {
    const failing: ScratchFiles = { write: () => Promise.reject(new Error('disk full')) };
    const { issues } = await limit(
      'PostToolUse',
      [{ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: over() } }],
      failing,
    );
    expect(issues[0]?.message).toContain('disk full');
  });
});

describe('through the engine', () => {
  test('a hook that prints a huge additionalContext: the outcome carries the pointer, the issues stay empty', async () => {
    const scratch = memoryScratch();
    const hook = entry('PostToolUse');
    const stdout = JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: over(TEXT_CAP * 2) },
    });
    const engine = createHookEngine({
      commands: scriptedRunner({ exitCode: 0, stdout }),
      locations: locations(),
      environment: fakeEnvironment(),
      scratch,
    });
    const outcome = await engine.dispatch(createHookRegistry([hook]), {
      event: 'PostToolUse',
      facts: FACTS.PostToolUse,
      session: session(),
      signal,
    });
    expect(scratch.files.size).toBe(1);
    expect(outcome.additionalContext).toHaveLength(1);
    expect(outcome.additionalContext[0]).toContain('Full output saved to');
    expect(outcome.issues).toEqual([]);
  });
});

describe('a field the event discards is not spilled (judgment)', () => {
  test.each(['Setup', 'Notification', 'SessionEnd', 'PostCompact'] as const)(
    '%s: an oversized systemMessage writes no file and is left as it is',
    async (event) => {
      const scratch = memoryScratch();
      const text = over();
      const { outputs, issues } = await limit(event, [{ systemMessage: text }], scratch);
      expect(scratch.files.size).toBe(0);
      expect(issues).toEqual([]);
      expect(outputs[0]?.output).toMatchObject({ systemMessage: text });
    },
  );

  test('an event that keeps the field still spills it', async () => {
    const scratch = memoryScratch();
    await limit('PostToolUse', [{ systemMessage: over() }], scratch);
    expect(scratch.files.size).toBe(1);
  });
});
