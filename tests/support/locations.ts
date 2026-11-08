import type { Locations } from '../../src/ports/index.ts';

export interface LocationOptions {
  readonly home?: string;
  readonly project?: string;
  /** Plugins live in `<plugins>/<id>`. */
  readonly plugins?: string;
  /** Plugin data lives in `<data>/<id>`. */
  readonly data?: string;
  /** Paths that exist as directories, for `existingDirectory`. */
  readonly directories?: readonly string[];
}

/** `Locations` over fixed POSIX-style paths; `dataCreated` lists the plugins whose data was asked for. */
export function locations(options: LocationOptions = {}): Locations & {
  readonly dataCreated: string[];
} {
  const {
    home = '/home/user',
    project = '/work/app',
    plugins = '/plugins',
    data = '/data',
  } = options;
  const directories = new Set(options.directories ?? []);
  const dataCreated: string[] = [];
  return {
    dataCreated,
    homeDir: () => home,
    projectDir: () => project,
    pluginRoot: (id) => `${plugins}/${id}`,
    pluginData: (id) => {
      dataCreated.push(id);
      return Promise.resolve(`${data}/${id}`);
    },
    joinPath: (base, relative) => `${base.replace(/\/+$/, '')}/${relative.replace(/^(\.\/)+/, '')}`,
    existingDirectory: (candidates) =>
      Promise.resolve(candidates.find((candidate) => directories.has(candidate))),
  };
}
