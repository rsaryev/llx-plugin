/** plugins/components.md § When the configuration dialog appears; manifest-reference.md § Where values are stored. */
import { expect, test } from 'bun:test';
import { configurationDialog } from '../../src/cli/configure-dialog.ts';
import { planConfigure } from '../../src/cli/configure-plan.ts';
import { applyConfig, notYetSetLine } from '../../src/cli/install-config.ts';
import type { ResolvedUserConfig } from '../../src/loading/resolve/user-config.ts';
import { spec } from '../support/spec.ts';

const config: ResolvedUserConfig = {
  declared: {
    api_url: { type: 'string', title: 'URL', description: 'API URL', required: true },
    api_token: { type: 'string', title: 'Token', description: 'Token', sensitive: true },
    tone: { type: 'string', title: 'Tone', description: 'Voice', default: 'neutral' },
  },
  values: { api_token: 'secret' },
};
spec(
  [
    'userConfig.components.When the configuration dialog appears',
    'manifest.troubleshooting.The userConfig dialog never appears',
  ],
  () => {
    test('interactive installs and enable show only unset options; explicit configuration shows all', () => {
      for (const event of ['session-install', 'session-enable', 'vscode-install'] as const) {
        expect(configurationDialog(event, config)).toMatchObject({ open: true, keys: ['api_url'] });
      }
      for (const event of ['session-configure', 'vscode-configure'] as const) {
        expect(configurationDialog(event, config)).toMatchObject({
          open: true,
          keys: ['api_url', 'api_token', 'tone'],
          inputs: { tone: 'neutral' },
        });
        expect(JSON.stringify(configurationDialog(event, config))).not.toContain('secret');
      }
      expect(
        configurationDialog('session-install', {
          ...config,
          values: { api_url: 'https://api.example', api_token: 'secret' },
        }).open,
      ).toBe(false);
    });
    test('shell install never prompts and reports unset values, including required counts', () => {
      expect(configurationDialog('shell-install', config)).toMatchObject({ open: false, keys: [] });
      const incomplete = applyConfig({}, { declared: config.declared });
      expect(notYetSetLine('example@acme', incomplete)).toBe(
        '2 userConfig options not yet set (1 required) — run /plugin configure example@acme in Claude Code, or pass --config KEY=VALUE.',
      );
      const complete = applyConfig(
        { api_url: 'https://api.example', api_token: 'token' },
        { declared: config.declared },
      );
      expect(notYetSetLine('example@acme', complete)).toBeUndefined();
    });
  },
);

spec('userConfig.rule.Where values are stored', () => {
  test('both configure and install split regular settings from secure-store values', () => {
    const saved = planConfigure(
      {
        plugin: 'example@acme',
        valuesStdin: '{"api_url":"https://api.example","api_token":"secret"}',
      },
      { loaded: [{ id: 'example@acme', config }] },
    );
    expect(saved.save).toEqual({
      settings: { api_url: 'https://api.example' },
      secrets: { api_token: 'secret' },
    });
    const installed = applyConfig(
      { api_url: 'https://api.example', api_token: 'secret' },
      { declared: config.declared },
    );
    expect(saved.save).toBeDefined();
    if (saved.save === undefined) throw new Error('valid configuration was not saved');
    expect(installed.plugin).toEqual(saved.save);
  });
});
