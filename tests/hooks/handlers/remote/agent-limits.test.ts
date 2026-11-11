/**
 * hooks.md § How agent hooks work and Agent hook configuration; hooks-guide.md § Agent-based hooks.
 * The host owns the model loop, but the kit must bind it to 50 turns and read-only investigation.
 */
import { expect, test } from 'bun:test';
import { runHandler } from '../../../../src/hooks/handlers/index.ts';
import { agentEntry, remoteContext } from '../../../support/hooks-remote.ts';
import { fakeModel } from '../../../support/ports.ts';
import { spec } from '../../../support/spec.ts';

spec(
  [
    'hooks.behavior.How agent hooks work',
    'hooks.behavior.Agent hook configuration',
    'hooks.guide.Agent-based hooks',
  ],
  () => {
    test('the verifier receives its input, read-only constraint and 50-turn bound', async () => {
      const models = fakeModel({ text: '{"ok":true}' });
      const result = await runHandler(
        agentEntry({ prompt: 'Inspect the changed files: $ARGUMENTS' }),
        remoteContext({ models, input: '{"hook_event_name":"Stop"}' }),
      );
      expect(models.calls).toHaveLength(1);
      expect(models.calls[0]).toMatchObject({
        prompt: expect.stringContaining('{"hook_event_name":"Stop"}'),
        timeoutMs: 60_000,
        maxTurns: 50,
        readOnly: true,
      });
      expect(models.calls[0]?.tools).toEqual(expect.arrayContaining(['Read', 'Grep', 'Glob']));
      expect(result.run).toMatchObject({ kind: 'model', ok: true });
    });

    test('a model/timeout override never relaxes the read-only or turn constraints', async () => {
      const models = fakeModel({ text: '{"ok":false,"reason":"missing test coverage"}' });
      const result = await runHandler(
        agentEntry({ prompt: 'Verify', model: 'haiku', timeout: 2 }),
        remoteContext({ models }),
      );
      expect(models.calls[0]).toMatchObject({
        model: 'haiku',
        timeoutMs: 2_000,
        maxTurns: 50,
        readOnly: true,
      });
      expect(result.run).toMatchObject({
        kind: 'model',
        ok: false,
        reason: 'missing test coverage',
      });
    });
  },
);
