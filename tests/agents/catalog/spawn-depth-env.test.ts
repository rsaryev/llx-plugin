/** env-vars.md § `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`: "default: 3"; "set `1` to turn nesting off". */
import { expect, test } from 'bun:test';
import { spawnDepthLimit } from '../../../src/agents/catalog/spawn.ts';
import { spec } from '../../support/spec.ts';

spec('environment.host.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH', () => {
  test('the default is 3, a number sets the layers, 1 turns nesting off', () => {
    expect(spawnDepthLimit(undefined)).toBe(3);
    expect(spawnDepthLimit('2')).toBe(2);
    expect(spawnDepthLimit('1')).toBe(1);
  });
});
