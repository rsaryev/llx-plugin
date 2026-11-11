/**
 * sub-agents.md § Frontmatter reference (the `permissionMode` row) and § Choose the subagent
 * scope (plugin subagents "don't support the `hooks`, `mcpServers`, or `permissionMode`
 * frontmatter fields"; "These fields are ignored when loading agents from a plugin"). The parse
 * side: what `readAgent` keeps of the field. Resolution against the main conversation is
 * tests/agents/permission-mode.test.ts.
 */
import { describe, expect, test } from 'bun:test';
import { PERMISSION_MODE_INPUTS } from '../../src/agents/permission-mode.ts';
import { readAgent } from '../../src/format/agent.ts';
import { at, file, FILES, loaded, plugin } from '../support/agent-files.ts';
import { spec } from '../support/spec.ts';

const read = (extra: string, origin = at('project')) =>
  readAgent(file(`name: helper\ndescription: Helps\n${extra}`), origin);

// The values of the row, copied by hand: "`default`, `acceptEdits`, `auto`, `dontAsk`,
// `bypassPermissions`, `plan`, or `manual` as an alias for `default`".
const MODES = ['default', 'acceptEdits', 'auto', 'dontAsk', 'bypassPermissions', 'plan'] as const;

spec('agents.frontmatter.permissionMode', () => {
  test('the field takes exactly the six modes and manual', () => {
    const inputs: readonly string[] = PERMISSION_MODE_INPUTS;
    expect(inputs.toSorted()).toEqual([...MODES, 'manual'].toSorted());
  });

  test.each(FILES)('a %s agent keeps each mode as the definition value', (source) => {
    for (const mode of MODES) {
      const result = read(`permissionMode: ${mode}`, at(source));
      expect(loaded(result).definition.permissionMode).toBe(mode);
      expect(result.issues).toEqual([]);
    }
  });

  test('manual is an alias for default', () => {
    const result = read('permissionMode: manual');
    expect(loaded(result).definition.permissionMode).toBe('default');
    expect(result.issues).toEqual([]);
  });

  test('leaving it unset leaves the definition without a mode, so the subagent inherits', () => {
    expect(loaded(read('')).definition).not.toHaveProperty('permissionMode');
  });

  test.each(['yolo', 'Manual', 'bypass', 'accept-edits', 'true'])(
    'a value that is no mode (%s) is dropped with a warning and the agent still loads',
    (value) => {
      const result = read(`permissionMode: ${value}`);
      expect(loaded(result).definition).not.toHaveProperty('permissionMode');
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]).toMatchObject({ severity: 'warning' });
      expect(result.issues[0]?.message).toContain('permissionMode');
    },
  );

  test('a plugin agent ignores it: it reaches no definition, whatever the value', () => {
    for (const value of ['bypassPermissions', 'plan', 'yolo']) {
      const result = read(`permissionMode: ${value}`, plugin(undefined, 'agents/helper.md'));
      const agent = loaded(result);
      expect(agent.definition).not.toHaveProperty('permissionMode');
      expect(agent.ignored).toEqual(['permissionMode']);
      expect(result.issues).toEqual([]);
    }
  });
});

describe('the same field in a plugin agent file next to supported ones', () => {
  test('only permissionMode is dropped; model is applied', () => {
    const agent = loaded(
      read('permissionMode: plan\nmodel: haiku', plugin(undefined, 'agents/helper.md')),
    );
    expect(agent.definition.model).toBe('haiku');
    expect(agent.ignored).toEqual(['permissionMode']);
  });
});
