/**
 * hooks.md § How prompt-based hooks work; Prompt hook configuration: model.
 * Model ids are a host choice; the kernel requests the documented small/fast role.
 */
import { expect, test } from 'bun:test';
import { runHandler } from '../../../../src/hooks/handlers/index.ts';
import { promptEntry, remoteContext } from '../../../support/hooks-remote.ts';
import { fakeModel } from '../../../support/ports.ts';
import { spec } from '../../../support/spec.ts';

spec(
  ['hooks.behavior.How prompt-based hooks work', 'hooks.behavior.Prompt hook configuration.model'],
  () => {
    test('the default asks the host for a small, fast verifier rather than its main model', async () => {
      const models = fakeModel({ text: '{"ok":true}' });
      await runHandler(promptEntry({ prompt: 'Check' }), remoteContext({ models }));
      expect(models.calls[0]?.model).toBeUndefined();
      expect(models.calls[0]?.modelPreference).toBe('small-fast');
    });

    test('an explicit model is forwarded without a competing default preference', async () => {
      const models = fakeModel({ text: '{"ok":true}' });
      await runHandler(
        promptEntry({ prompt: 'Check', model: 'custom-approved-model' }),
        remoteContext({ models }),
      );
      expect(models.calls[0]?.model).toBe('custom-approved-model');
      expect(models.calls[0]?.modelPreference).toBeUndefined();
    });
  },
);
