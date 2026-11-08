/**
 * plugins/troubleshooting.md § Warning: No commands found in plugin <name> custom directory:
 * empty custom command directories produce debug output, not a Plugin Errors-tab finding.
 */
import { expect, test } from 'bun:test';
import { loadPlugin } from '../../src/loading/index.ts';
import { memoryFiles } from '../support/ports.ts';
import { spec } from '../support/spec.ts';

spec(
  'manifest.troubleshooting.Warning: No commands found in plugin <name> custom directory',
  () => {
    test('an empty declared directory is a debug message and other components keep loading', async () => {
      const result = await loadPlugin({
        files: memoryFiles({
          '.claude-plugin/plugin.json': JSON.stringify({ name: 'tool', commands: './custom' }),
          'custom/README.txt': 'Not a command.',
          'skills/hello/SKILL.md': 'Hello.',
        }),
      });
      expect(result.plugin?.skills).toHaveLength(1);
      expect(result.debug).toEqual(['Warning: No commands found in plugin tool custom directory']);
      expect(result.issues).toEqual([]);
    });

    test('a command in the directory prevents the warning', async () => {
      const result = await loadPlugin({
        files: memoryFiles({
          '.claude-plugin/plugin.json': JSON.stringify({ name: 'tool', commands: './custom' }),
          'custom/hello.md': 'Hello.',
        }),
      });
      expect(result.plugin?.commands).toHaveLength(1);
      expect(result.debug ?? []).toEqual([]);
    });
  },
);
