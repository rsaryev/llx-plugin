/**
 * settings.md § A value you set is ignored ("The file can't set that value": "`auto` and
 * `bypassPermissions` don't take effect from project or local settings; set them in user or managed
 * settings instead"; the telemetry export variables in `env`); settings-reference.md §
 * `permissions.defaultMode` ("Before v2.1.257, `bypassPermissions` took effect from any file") and
 * § "Variables Claude Code ignores in `env`". An id with an apostrophe is a template literal: the
 * SP2 gate cannot read it from a quoted string.
 */
import { describe, expect, test } from 'bun:test';
import { createGeneralView } from '../../support/settings-general.ts';
import { issuesOf, layerOf } from '../../support/settings-layers.ts';
import { spec } from '../../support/spec.ts';

const defaultMode = (scope: Parameters<typeof layerOf>[0], mode: string) =>
  createGeneralView([layerOf(scope, { permissions: { defaultMode: mode } })]).get(
    'permissions.defaultMode',
  );

spec(`settingsMerge.settings.A value you set is ignored.The file can't set that value`, () => {
  describe('permissions.defaultMode: auto and bypassPermissions from a repository file', () => {
    test('do not take effect from project or local settings, and do from user, managed and --settings', () => {
      for (const mode of ['auto', 'bypassPermissions'] as const) {
        for (const scope of ['project', 'local'] as const) {
          expect(defaultMode(scope, mode)).toBeUndefined();
        }
        for (const scope of ['user', 'managed', 'flag'] as const) {
          expect(defaultMode(scope, mode)).toBe(mode);
        }
      }
    });

    test('a project value that is not elevating applies, and an ignored one leaves the lower value in force', () => {
      const view = createGeneralView([
        layerOf('user', { permissions: { defaultMode: 'acceptEdits' } }),
        layerOf('project', { permissions: { defaultMode: 'bypassPermissions' } }),
      ]);
      expect(view.get('permissions.defaultMode')).toBe('acceptEdits');
      expect(view.merged().permissions).toEqual({ defaultMode: 'acceptEdits' });
      expect(defaultMode('project', 'plan')).toBe('plan');
    });
  });

  describe('env: the telemetry export variables from a repository file', () => {
    const REPOSITORY_ENV = {
      FOO: '1',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'https://collector.example',
      OTEL_EXPORTER_OTLP_METRICS_HEADERS: 'Authorization=secret-token',
      OTEL_EXPORTER_PROMETHEUS_PORT: '9464',
      OTEL_METRICS_EXPORTER: 'otlp',
      OTEL_LOGS_EXPORTER: 'none',
      OTEL_LOG_USER_PROMPTS: '1',
      OTEL_LOG_TOOL_CONTENT: '0',
      OTEL_LOG_RAW_API_BODIES: '1',
      CLAUDE_CODE_ENABLE_TELEMETRY: '1',
    };

    test('are ignored from project and local settings apart from the off values, and every other variable stays', () => {
      for (const scope of ['project', 'local'] as const) {
        expect(createGeneralView([layerOf(scope, { env: REPOSITORY_ENV })]).get('env')).toEqual({
          FOO: '1',
          OTEL_LOGS_EXPORTER: 'none',
          OTEL_LOG_TOOL_CONTENT: '0',
        });
      }
    });

    test('are read as written from user, managed and --settings files', () => {
      for (const scope of ['user', 'managed', 'flag'] as const) {
        expect(createGeneralView([layerOf(scope, { env: REPOSITORY_ENV })]).get('env')).toEqual(
          REPOSITORY_ENV,
        );
      }
    });

    test('each ignored variable is a warning that names it and never shows a value', () => {
      const issues = issuesOf('project', { env: REPOSITORY_ENV });
      expect(issues.map((issue) => issue.severity)).toEqual(Array(7).fill('warning'));
      expect(issues.map((issue) => issue.path)).toContain(
        'project:env.OTEL_EXPORTER_OTLP_ENDPOINT',
      );
      const text = issues.map((issue) => issue.message).join('\n');
      expect(text).not.toContain('collector.example');
      expect(text).not.toContain('secret-token');
    });

    test('an off value overrides the user value, but not one of managed settings or --settings', () => {
      const off = layerOf('project', { env: { OTEL_LOGS_EXPORTER: 'none' } });
      const user = layerOf('user', { env: { OTEL_LOGS_EXPORTER: 'otlp' } });
      expect(createGeneralView([user, off]).get('env')).toEqual({ OTEL_LOGS_EXPORTER: 'none' });
      for (const above of ['managed', 'flag'] as const) {
        const set = layerOf(above, { env: { OTEL_LOGS_EXPORTER: 'otlp' } });
        expect(createGeneralView([user, off, set]).get('env')).toEqual({
          OTEL_LOGS_EXPORTER: 'otlp',
        });
      }
    });
  });
});
