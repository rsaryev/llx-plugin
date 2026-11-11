/**
 * plugins/dependencies.md § Test a plugin and its dependency locally: "The local copy of the
 * dependency satisfies your plugin's dependency entry"; "your plugin stops loading whenever the
 * local copy is disabled or absent"; without the dependency's `--plugin-dir` flag "the error reports
 * the dependency as not installed"; "a version constraint isn't checked against a local copy".
 */
import { describe, expect, test } from 'bun:test';
import { pluginDirDependencyIssues } from '../../src/marketplace/plugin-dir-dependencies.ts';
import { spec } from '../support/spec.ts';

const names = (plugins: Parameters<typeof pluginDirDependencyIssues>[0]) =>
  pluginDirDependencyIssues(plugins).map((one) => one.name);

spec('dependencies.guide.Test a plugin and its dependency locally', () => {
  test('a plugin whose dependency is loaded beside it with --plugin-dir loads', () => {
    expect(
      names([{ name: 'my-plugin', dependencies: ['my-dependency'] }, { name: 'my-dependency' }]),
    ).toEqual([]);
  });

  test('without the dependency it stops loading, and the error reports it as not installed', () => {
    const [unloaded] = pluginDirDependencyIssues([
      { name: 'my-plugin', dependencies: ['my-dependency'] },
    ]);
    expect(unloaded?.name).toBe('my-plugin');
    expect(unloaded?.issue.message).toBe('Dependency "my-dependency@inline" is not installed');
    expect(unloaded?.issue.errorType).toBe('dependency-unsatisfied');
  });

  test('no version constraint is checked against the local copy', () => {
    const plugins = [{ name: 'p', dependencies: [{ name: 'd', version: '^9' }] }, { name: 'd' }];
    expect(names(plugins)).toEqual([]);
  });

  test('an entry that names a marketplace also matches the local copy (v2.1.242 or later)', () => {
    expect(names([{ name: 'p', dependencies: ['d@elsewhere'] }, { name: 'd' }])).toEqual([]);
  });
});

describe('a chain of --plugin-dir dependencies (judgment, oracle 2.1.319)', () => {
  test('a plugin that does not load is no copy: what needs it stops loading too', () => {
    const plugins = [
      { name: 'qa', dependencies: ['qb'] },
      { name: 'qb', dependencies: ['qc'] },
      { name: 'qe', dependencies: ['qf'] },
      { name: 'qf' },
    ];
    expect(names(plugins).toSorted()).toEqual(['qa', 'qb']);
  });
});
