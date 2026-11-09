import type { FolderScan } from '../../src/ports/folder-scan.ts';

/** The port with every read of a path ending in `suffix` refused (while `active`), as a host's size limit refuses one. */
export function refusing(
  port: FolderScan,
  suffix: string,
  reason: string,
  active: () => boolean = () => true,
): FolderScan {
  return {
    managedDirectory: () => port.managedDirectory(),
    repository: (cwd, abort) => port.repository(cwd, abort),
    directoriesBelow: (start, touched, abort) => port.directoriesBelow(start, touched, abort),
    async open(dir, abort) {
      const folder = await port.open(dir, abort);
      if (folder === undefined) return undefined;
      return {
        ...folder,
        hostPath: (path) => folder.hostPath(path),
        canonicalPath: (path, again) => folder.canonicalPath(path, again),
        files: {
          ...folder.files,
          readText: async (path, again) => {
            if (active() && path.endsWith(suffix)) throw new Error(reason);
            return folder.files.readText(path, again);
          },
        },
      };
    },
  };
}
