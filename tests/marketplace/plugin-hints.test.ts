/**
 * plugins/cli-hints.md § Emit the hint, § Hint format, § Check when the prompt appears, § Preview what
 * the user sees. Where the docs are silent (a malformed tag's fate beyond "ignored", the order the checks
 * report in, a line with surrounding whitespace) the tests sit last, outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { fakeEnvironment } from '../../src/testing/ports/index.ts';
import {
  HINT_ANSWER_TIMEOUT_MS,
  HINT_PROMPT_LIMIT,
  answerEffect,
  dialogLines,
  hintLine,
  promptVerdict,
  shouldEmitHint,
  stripHints,
  supportedHint,
  type PluginHint,
  type PromptFacts,
} from '../../src/marketplace/plugin-hints.ts';
import { spec } from '../support/spec.ts';

const H = 'install.hints.';
const VALUE = 'example-cli@claude-plugins-official';
const hint: PluginHint = { v: '1', type: 'plugin', value: VALUE };
const facts = (extra: Partial<PromptFacts> = {}): PromptFacts => ({
  interactiveTerminal: true,
  localAttended: true,
  installable: true,
  analyticsOn: true,
  promptedThisSession: false,
  promptedPlugins: [],
  hintsTurnedOff: false,
  ...extra,
});
const refusal = (extra: Partial<PromptFacts>, given: PluginHint = hint) => {
  const verdict = promptVerdict(given, facts(extra));
  return verdict.show ? undefined : verdict.reason;
};

spec(`${H}Emit the hint`, () => {
  test('the tag is emitted only when CLAUDECODE or CLAUDE_CODE_CHILD_SESSION is set', () => {
    expect(shouldEmitHint(fakeEnvironment())).toBe(false);
    expect(shouldEmitHint(fakeEnvironment({ CLAUDECODE: '1' }))).toBe(true);
    expect(shouldEmitHint(fakeEnvironment({ CLAUDE_CODE_CHILD_SESSION: '1' }))).toBe(true);
  });
  test('the documented line is one tag with v, type and value', () => {
    expect(hintLine(VALUE)).toBe(
      '<claude-code-hint v="1" type="plugin" value="example-cli@claude-plugins-official" />',
    );
  });
  test('Claude Code removes the line from Bash and PowerShell output, and the model sees the rest', () => {
    const result = stripHints(`building\n${hintLine(VALUE)}\ndone`);
    expect(result.output).toBe('building\ndone');
    expect(result.hints).toEqual([hint]);
  });
});

spec(`${H}Hint format.v`, () => {
  test('1 is the only supported protocol version', () => {
    expect(supportedHint(hint)).toEqual({
      plugin: 'example-cli',
      marketplace: 'claude-plugins-official',
    });
    expect(supportedHint({ ...hint, v: '2' })).toBeUndefined();
  });
  test('the line is removed even when v is unrecognized', () => {
    const result = stripHints('<claude-code-hint v="2" type="plugin" value="a@b" />\nx');
    expect(result.output).toBe('x');
    expect(result.hints).toHaveLength(1);
  });
});

spec(`${H}Hint format.type`, () => {
  test('plugin is the only supported hint kind', () => {
    expect(supportedHint({ ...hint, type: 'tool' })).toBeUndefined();
  });
  test('the line is removed even when type is unrecognized', () => {
    expect(stripHints('<claude-code-hint v="1" type="tool" value="a@b" />\nx').output).toBe('x');
  });
});

spec(`${H}Hint format.value`, () => {
  test('the identifier is name@marketplace', () => {
    expect(supportedHint({ ...hint, value: 'a@b' })).toEqual({ plugin: 'a', marketplace: 'b' });
    for (const value of ['plain', '@b', 'a@', 'a@b@c']) {
      expect(supportedHint({ ...hint, value })).toBeUndefined();
    }
  });
  test('values may be double-quoted or unquoted; an unquoted value holds no whitespace', () => {
    expect(stripHints('<claude-code-hint v=1 type=plugin value=a@b />').hints).toEqual([
      { v: '1', type: 'plugin', value: 'a@b' },
    ]);
    expect(stripHints('<claude-code-hint v="1" type="plugin" value="a@b" />').hints).toHaveLength(
      1,
    );
    expect(stripHints('<claude-code-hint v=1 type=plugin value=a b />').hints).toEqual([]);
  });
  test('the tag must occupy its own line: a tag embedded mid-line is ignored', () => {
    const line = `note ${hintLine(VALUE)} more`;
    expect(stripHints(line)).toEqual({ output: line, hints: [] });
  });
});

spec(`${H}Check when the prompt appears.Official and installable`, () => {
  test('the marketplace is one of Anthropic official names; the community one is not', () => {
    expect(refusal({}, { ...hint, value: 'x@claude-community' })).toBe('not-official');
    expect(refusal({}, { ...hint, value: 'x@acme-tools' })).toBe('not-official');
    expect(promptVerdict({ ...hint, value: 'x@claude-code-plugins' }, facts()).show).toBe(true);
  });
  test('the plugin must be found locally, not installed, and not blocked by policy', () => {
    expect(refusal({ installable: false })).toBe('not-installable');
  });
});

spec(`${H}Check when the prompt appears.Analytics on`, () => {
  test('a session with analytics off never prompts', () => {
    expect(refusal({ analyticsOn: false })).toBe('analytics-off');
    expect(refusal({ analyticsOn: true })).toBeUndefined();
  });
});

spec(`${H}Check when the prompt appears.Frequency limits`, () => {
  test('one prompt per session', () => {
    expect(refusal({ promptedThisSession: true })).toBe('already-prompted-this-session');
  });
  test('one prompt ever per plugin, whatever the answer was', () => {
    expect(refusal({ promptedPlugins: [VALUE] })).toBe('already-prompted-for-plugin');
    expect(refusal({ promptedPlugins: ['other@claude-plugins-official'] })).toBeUndefined();
  });
  test('none once 100 plugins have been prompted for on the machine', () => {
    const many = (count: number) => Array.from({ length: count }, (_, index) => `p${index}@m`);
    expect(HINT_PROMPT_LIMIT).toBe(100);
    expect(refusal({ promptedPlugins: many(99) })).toBeUndefined();
    expect(refusal({ promptedPlugins: many(100) })).toBe('prompt-limit');
  });
});

spec(`${H}Check when the prompt appears.Not turned off`, () => {
  test('a user who chose "don\'t show plugin installation hints again" gets none', () => {
    expect(refusal({ hintsTurnedOff: true })).toBe('hints-turned-off');
  });
});

spec(`${H}Check when the prompt appears.Local, attended session`, () => {
  test('a cloud, Remote Control or teammate session never prompts', () => {
    expect(refusal({ localAttended: false })).toBe('not-local-attended');
  });
  test('claude -p, subagent runs and hook command output strip the tag and show no prompt', () => {
    expect(refusal({ interactiveTerminal: false })).toBe('not-interactive');
    expect(stripHints(`${hintLine(VALUE)}\nout`).output).toBe('out');
  });
  test('when every check passes the dialog shows', () => {
    expect(promptVerdict(hint, facts())).toEqual({
      show: true,
      plugin: 'example-cli',
      marketplace: 'claude-plugins-official',
    });
  });
});

describe('the dialog (Preview what the user sees: no requirement of its own)', () => {
  describe('text and answers', () => {
    test('the dialog names the first word of the command Claude ran, the plugin and the marketplace', () => {
      const lines = dialogLines(
        'example-cli deploy --prod',
        'example-cli',
        'claude-plugins-official',
        'Official integration',
      );
      expect(lines).toContain('The example-cli command suggests installing a plugin.');
      expect(lines).toContain('Plugin: example-cli');
      expect(lines).toContain('Marketplace: claude-plugins-official');
      expect(lines).toContain('Description: Official integration');
      expect(lines.slice(-3)).toEqual([
        '1. Yes, install',
        '2. No',
        "3. No, and don't show plugin installation hints again",
      ]);
    });
    test('each answer has one effect, and no answer for 30 seconds counts as No', () => {
      expect(answerEffect('install')).toEqual({ install: true, turnOff: false });
      expect(answerEffect('no')).toEqual({ install: false, turnOff: false });
      expect(answerEffect('never')).toEqual({ install: false, turnOff: true });
      expect(answerEffect('timeout')).toEqual(answerEffect('no'));
      expect(HINT_ANSWER_TIMEOUT_MS).toBe(30_000);
    });
  });
});

describe('judgments: hints', () => {
  test('a line with surrounding whitespace is still a tag on its own line', () => {
    expect(stripHints(`  ${hintLine(VALUE)}  \r\nx`).hints).toHaveLength(1);
  });
  test('a tag missing an attribute is removed but yields no hint', () => {
    expect(stripHints('<claude-code-hint v="1" type="plugin" />\nx')).toEqual({
      output: 'x',
      hints: [],
    });
  });
});
