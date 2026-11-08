/**
 * server-managed-settings.md § Per-key exceptions across managed sources (the telemetry unit of the
 * `env` block), which managed-settings.md § Keys read from every admin source points to. The page
 * has requirement ids of its own; these cases check the code this module holds for that pointer, so
 * they are not under spec().
 */
import { describe, expect, test } from 'bun:test';
import { policyOf } from '../../support/managed.ts';

const OTEL = 'OTEL_EXPORTER_OTLP_ENDPOINT';
const HEADERS = 'OTEL_EXPORTER_OTLP_HEADERS';

describe('the env telemetry unit across admin sources', () => {
  test('the exporter, content-capture and beta tracing variables follow the highest source that sets any of them', () => {
    const settings = policyOf({
      remote: { env: { [OTEL]: 'https://remote.example', OTHER: 'r' } },
      file: {
        env: {
          [OTEL]: 'https://file.example',
          [HEADERS]: 'token=file',
          OTHER: 'f',
          ONLY_FILE: 'f',
        },
      },
    });
    expect(settings.env).toEqual({ [OTEL]: 'https://remote.example', OTHER: 'r', ONLY_FILE: 'f' });
  });

  test('an endpoint from one source never pairs with credentials of another', () => {
    const settings = policyOf({
      remote: { env: { OTEL_LOGS_EXPORTER: 'otlp' } },
      file: { env: { [HEADERS]: 'token=file', [OTEL]: 'https://file.example' } },
    });
    expect(settings.env).toEqual({ OTEL_LOGS_EXPORTER: 'otlp' });
  });

  test('a source that is not selected but delivers otelHeadersHelper lands none of the unit and still blocks lower sources', () => {
    const settings = policyOf({
      remote: { env: { OTHER: 'r' } },
      plist: { otelHeadersHelper: '/bin/headers', env: { [OTEL]: 'https://plist.example' } },
      file: { env: { [OTEL]: 'https://file.example', ONLY_FILE: 'f' } },
    });
    expect(settings.env).toEqual({ OTHER: 'r', ONLY_FILE: 'f' });
  });

  test('the selected source that delivers otelHeadersHelper lands its unit', () => {
    const settings = policyOf({
      remote: { otelHeadersHelper: '/bin/headers', env: { [OTEL]: 'https://remote.example' } },
      file: { env: { [OTEL]: 'https://file.example' } },
    });
    expect(settings.env).toEqual({ [OTEL]: 'https://remote.example' });
    expect(settings.otelHeadersHelper).toBe('/bin/headers');
  });
});
