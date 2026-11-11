/**
 * Settings resolution over a stack of four files (managed, local, project, user) of R permission rules
 * and R `env` entries each: `loadSettingsLayers`, `createPolicyView`, then the rules a session checks
 * (`permissionRulesOf`). Every file is parsed once.
 */
import { permissionRulesOf } from '../../../src/host/index.ts';
import {
  createPolicyView,
  loadSettingsLayers,
  type PolicyScope,
  type SettingsSources,
} from '../../../src/settings/index.ts';
import { settingsFile } from '../inputs.ts';
import { signal, type Scenario } from './context.ts';

const STACK: readonly PolicyScope[] = ['managed', 'local', 'project', 'user'];

export const SETTINGS: readonly Scenario[] = [
  {
    id: 'settings.resolve',
    size: 'R rules of each kind per file',
    sizes: [4, 8, 16],
    laws: { resolve: 'linear' },
    async run(size, bench) {
      const sources: SettingsSources = {
        read: (scope) =>
          Promise.resolve(
            STACK.includes(scope) ? settingsFile(bench.salt, scope, size) : undefined,
          ),
      };
      const resolve = await bench.tally.measure(async () => {
        const { layers } = await loadSettingsLayers(sources, { signal: signal() });
        const view = createPolicyView(layers);
        view.get('env');
        return permissionRulesOf(view, {
          trusted: () => true,
          local: { tracked: false, claudeDirIsSymlink: false },
          flagSettings: 'inline',
        });
      });
      return { resolve };
    },
  },
];
