import type { Environment, ScratchFiles } from '../../ports/index.ts';

/** An `Environment` over a fixed record. */
export function fakeEnvironment(variables: Readonly<Record<string, string>> = {}): Environment {
  return {
    get: (name) => (Object.hasOwn(variables, name) ? variables[name] : undefined),
    snapshot: () => ({ ...variables }),
  };
}

/** `ScratchFiles` that keeps what it is given: `files` maps the returned path to the content. */
export function memoryScratch(directory = '/scratch'): ScratchFiles & {
  readonly files: Map<string, string>;
} {
  const files = new Map<string, string>();
  return {
    files,
    write: (name, content) => {
      const path = `${directory}/${files.size + 1}-${name}`;
      files.set(path, content);
      return Promise.resolve(path);
    },
  };
}
