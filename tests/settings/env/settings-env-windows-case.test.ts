/**
 * settings-reference.md § Variables Claude Code ignores in `env` and § How `env` values interact with
 * your shell, on a Windows host: its variable names are case-insensitive (spec/judgments.md,
 * `settings/env.ts`), so the off values and the launch environment are read without regard to case.
 * Asserted outside `spec(...)`: the docs say nothing of case.
 */
import { describe, expect, test } from 'bun:test';
import { resolveSettingsEnv } from '../../../src/settings/index.ts';
import type { PolicyScope } from '../../../src/settings/index.ts';
import { layerOf } from '../../support/settings-layers.ts';

const layer = (scope: PolicyScope, env: Record<string, unknown>) => layerOf(scope, { env });
const resolve = (
  layers: ReturnType<typeof layer>[],
  context: Partial<Parameters<typeof resolveSettingsEnv>[1]> = {},
) => resolveSettingsEnv(layers, { isFolderTrusted: () => true, ...context });

describe('judgment: Windows names are compared without case', () => {
  const windows = { windows: true };

  test('an off value of a project file applies whatever the case of the name', () => {
    const result = resolve([layer('project', { otel_logs_exporter: 'none' })], windows);
    expect(result.values).toEqual({ otel_logs_exporter: 'none' });
    expect(result.ignored).toEqual([]);
  });

  test('a launch variable of another case still stands over the off value and owns the environment', () => {
    const off = layer('project', { OTEL_LOGS_EXPORTER: 'none' });
    expect(
      resolve([off], {
        ...windows,
        environment: { otel_logs_exporter: 'otlp' },
      }).ignored,
    ).toEqual([{ name: 'OTEL_LOGS_EXPORTER', scope: 'project', why: 'shell-keeps-it' }]);

    const result = resolve([layer('user', { Path: 'file', B: 'file' })], {
      ...windows,
      environment: { PATH: 'launch' },
      launchOwnsEnvironment: true,
    });
    expect(result.values).toEqual({ B: 'file' });
    expect(result.ignored).toEqual([{ name: 'Path', scope: 'user', why: 'launch-environment' }]);
  });

  test('an undefined launch entry is not a set variable', () => {
    const result = resolve([layer('user', { Path: 'file' })], {
      ...windows,
      environment: { PATH: undefined },
      launchOwnsEnvironment: true,
    });
    expect(result.values).toEqual({ Path: 'file' });
  });
});
