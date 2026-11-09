import type { Clock } from '../ports/clock.ts';
import type { PluginStateStore, Sha256, StateStoreFailure } from '../ports/marketplace.ts';
import {
  parseInstalledPlugins,
  serializeInstalledPlugins,
  type InstalledPluginsRead,
} from './installed-plugins.ts';
import { STORE_NAMES, createStoreLayout } from './store-layout.ts';

/**
 * Reading `installed_plugins.json` through `PluginStateStore` and doing what the troubleshooting
 * page says Claude Code does with a file it cannot use (plugins/troubleshooting.md): keep the old
 * text of an unreadable file in a dated `.kept` copy and start the file over; copy records under
 * names no version can use into a dated `.set-aside` file, then drop them; and never rewrite the file
 * while a record, or the format, is one this version cannot read. A copy is written before the file
 * changes, so a failed copy loses nothing.
 *
 * Judgments (spec/judgments.md): `<date>` is the clock's UTC day as `YYYY-MM-DD`; `<hash>` is the
 * first eight hex digits of the SHA-256 of the text the copy keeps; a `.set-aside` copy is the
 * dropped keys with their raw values, as JSON.
 */

export interface InstalledPluginsPorts {
  readonly store: PluginStateStore;
  readonly sha256: Sha256;
  readonly clock: Clock;
}

export interface LoadedInstalledPlugins {
  readonly read: InstalledPluginsRead;
  /** A copy or the rewritten file could not be written: the file is as it was. */
  readonly failure?: StateStoreFailure;
}

const pad = (value: number, width: number): string => String(value).padStart(width, '0');

/** Days since 1970-01-01 to `YYYY-MM-DD` (the civil-from-days algorithm; the kit uses no `Date`). */
function isoDay(ms: number): string {
  const days = Math.floor(ms / 86_400_000) + 719_468;
  const era = Math.floor(days / 146_097);
  const dayOfEra = days - era * 146_097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36_524) -
      Math.floor(dayOfEra / 146_096)) /
      365,
  );
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const shifted = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * shifted + 2) / 5) + 1;
  const month = shifted < 10 ? shifted + 3 : shifted - 9;
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

const failed = (outcome: undefined | StateStoreFailure): StateStoreFailure | undefined => outcome;

async function copyName(
  ports: InstalledPluginsPorts,
  text: string,
  name: (date: string, hash: string) => string,
): Promise<string> {
  const digest = await ports.sha256.hex(new TextEncoder().encode(text));
  return name(isoDay(ports.clock.now()), digest.slice(0, 8));
}

/** Reads the records and applies the recovery the read calls for. A name here is relative to the root. */
export async function loadInstalledPlugins(
  ports: InstalledPluginsPorts,
  { signal }: { readonly signal: AbortSignal },
): Promise<LoadedInstalledPlugins> {
  const { store } = ports;
  const text = await store.read(STORE_NAMES.installedPlugins, signal);
  const read = parseInstalledPlugins(text);
  const layout = createStoreLayout('', (_base, relative) => relative);
  if (read.rebuilt !== undefined) {
    const kept = await copyName(ports, read.rebuilt.text, (date, hash) =>
      layout.unreadableCopy(date, hash),
    );
    const failure =
      failed(await store.write(kept, read.rebuilt.text, signal)) ??
      failed(
        await store.write(STORE_NAMES.installedPlugins, serializeInstalledPlugins({}), signal),
      );
    return failure === undefined ? { read } : { read, failure };
  }
  if (!read.writable || Object.keys(read.setAside).length === 0) return { read };
  const copy = JSON.stringify(read.setAside, null, 2);
  const failure =
    failed(
      await store.write(
        await copyName(ports, copy, (date, hash) => layout.setAsideCopy(date, hash)),
        copy,
        signal,
      ),
    ) ??
    failed(
      await store.write(
        STORE_NAMES.installedPlugins,
        serializeInstalledPlugins(read.records),
        signal,
      ),
    );
  return failure === undefined ? { read } : { read, failure };
}
