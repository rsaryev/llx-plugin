/** Lockfile and package.json texts of the dependency-install tests, written the way npm and Bun write them. */
export const REGISTRY_TARBALL = 'https://registry.npmjs.org/left-pad/-/left-pad-1.3.0.tgz';

export interface NpmLockOptions {
  readonly version?: number;
  readonly root?: Record<string, unknown>;
  readonly packages?: Record<string, unknown>;
}

export function npmLock(options: NpmLockOptions = {}): string {
  return JSON.stringify({
    name: 'formatter',
    lockfileVersion: options.version ?? 3,
    packages: {
      '': { name: 'formatter', dependencies: { 'left-pad': '^1.3.0' }, ...options.root },
      'node_modules/left-pad': {
        version: '1.3.0',
        resolved: REGISTRY_TARBALL,
        integrity: 'sha512-abc',
      },
      ...options.packages,
    },
  });
}

export interface BunLockOptions {
  readonly version?: number;
  readonly root?: string;
  readonly packages?: string;
}

/** `bun.lock` is JSON with trailing commas. */
export function bunLock(options: BunLockOptions = {}): string {
  return `{
  "lockfileVersion": ${options.version ?? 1},
  "workspaces": {
    "": {
      "name": "formatter",
      "dependencies": {
        "left-pad": "^1.3.0",
      },${options.root ?? ''}
    },
  },
  "packages": {
    "left-pad": ["left-pad@1.3.0", "", {}, "sha512-abc"],${options.packages ?? ''}
  },
}
`;
}
