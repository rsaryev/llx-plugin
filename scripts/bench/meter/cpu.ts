/**
 * Countable proxies of the kit's CPU work, with no counter in `src/`: the global entry points it
 * reaches are wrapped while a run of the meter lasts. `cpu.JSON.parse` counts JSON documents parsed,
 * `cpu.RegExp` every regular expression built at run time (`new RegExp(...)`, never a literal),
 * `cpu.RegExp.exec` every match a regular expression runs (`test`, `match`, `replace` and `split`
 * reach `exec`; a `split` by a pattern tries it at each position, so it counts about once per
 * character of the text split),
 * `cpu.yaml.parse` every YAML document (frontmatter) and `cpu.acorn.parse` every ES module parsed.
 * Libraries the kit calls count too: their work is the kit's cost.
 */
import { Parser as AcornParser } from 'acorn';
import { Parser as YamlParser } from 'yaml';
import type { Tally } from './tally.ts';

type Restore = () => void;

/** Replaces `owner[key]` by a function that counts `name` and calls the original. */
function wrapMethod(owner: object, key: string, name: string, tally: Tally): Restore {
  const original: unknown = Reflect.get(owner, key);
  if (typeof original !== 'function') throw new Error(`${name}: nothing to wrap`);
  Reflect.set(owner, key, function counting(this: unknown, ...args: unknown[]): unknown {
    tally.work(name);
    return Reflect.apply(original, this, args);
  });
  return () => Reflect.set(owner, key, original);
}

/** `RegExp` as a global that counts each construction, called with or without `new`. */
function wrapRegExp(tally: Tally): Restore {
  const original = globalThis.RegExp;
  globalThis.RegExp = new Proxy(original, {
    construct(target, args, newTarget) {
      tally.work('cpu.RegExp');
      return Reflect.construct(target, args, newTarget === globalThis.RegExp ? target : newTarget);
    },
    apply(target, self, args) {
      tally.work('cpu.RegExp');
      return Reflect.apply(target, self, args);
    },
  });
  return () => {
    globalThis.RegExp = original;
  };
}

/** Installs every CPU proxy for the life of the process run; returns what undoes them. */
export function countCpu(tally: Tally): Restore {
  const restores = [
    wrapMethod(JSON, 'parse', 'cpu.JSON.parse', tally),
    wrapRegExp(tally),
    wrapMethod(RegExp.prototype, 'exec', 'cpu.RegExp.exec', tally),
    wrapMethod(YamlParser.prototype, 'parse', 'cpu.yaml.parse', tally),
    wrapMethod(AcornParser.prototype, 'parse', 'cpu.acorn.parse', tally),
  ];
  return () => {
    for (const restore of restores.toReversed()) restore();
  };
}
