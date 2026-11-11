import type { Locations } from '../../src/ports/index.ts';

/**
 * `Locations` as a Windows host reports them: native backslash paths, a data folder created on
 * first use. `dataCreated` lists the identifiers the kit asked a data folder for.
 */
export function windowsLocations(): Locations & { readonly dataCreated: string[] } {
  const dataCreated: string[] = [];
  return {
    dataCreated,
    homeDir: () => 'C:\\Users\\you',
    projectDir: () => 'C:\\Users\\you\\app',
    pluginRoot: (id) => `C:\\Users\\you\\.claude\\plugins\\cache\\${id}`,
    pluginData: (id) => {
      dataCreated.push(id);
      return Promise.resolve(`C:\\Users\\you\\.claude\\plugins\\data\\${id}`);
    },
    joinPath: (base, relative) => `${base}\\${relative.replaceAll('/', '\\')}`,
    existingDirectory: () => Promise.resolve(undefined),
  };
}
