/**
 * Uninstalling a plugin that enabled plugins depend on. plugins/cli-reference.md § plugin uninstall
 * names no refusal and no `--force` (`plugin disable` alone "fails and names the dependents").
 * Oracle 2.1.322 (spec/judgments.md), a black-box probe with a private HOME and config folder:
 * `claude plugin uninstall b@mk` with `a@mk` and `c@mk` enabled and `d@mk` disabled, each depending
 * on `b`, exits 0 with `Successfully uninstalled plugin: b (scope: user) — warning: required by a, c`,
 * the same text in the `--json` message; `a@mk` then shows `Dependency "b@mk" is not installed`.
 * Tested outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { conclude, ID, lastJson, lines, removing, start, world } from '../support/uninstall.ts';

const graph = world(
  [ID, { scope: 'project' }],
  ['a@my-marketplace', { scope: 'user', deps: ['formatter'] }],
  ['c@my-marketplace', { scope: 'project', deps: ['formatter'] }],
  ['d@my-marketplace', { scope: 'user', deps: ['formatter'], enabled: false }],
);

describe('uninstall of a plugin others need (oracle 2.1.322)', () => {
  test('is not refused: the success line names the enabled dependents', () => {
    expect(removing(start({}, graph)).requiredBy).toEqual(['a', 'c']);
    expect(lines(conclude({}, undefined, graph)).stdout).toEqual([
      'Successfully uninstalled plugin: formatter (scope: project) — warning: required by a, c',
    ]);
  });

  test('the --json message carries the same warning', () => {
    expect(lastJson(conclude({ json: true }, undefined, graph))['message']).toBe(
      'Successfully uninstalled plugin: formatter (scope: project) — warning: required by a, c',
    );
  });

  test('no dependents, no warning', () => {
    expect(removing(start({})).requiredBy).toEqual([]);
  });
});
