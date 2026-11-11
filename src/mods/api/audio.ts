import { z } from 'zod';
import type { ModsNamespaceApi } from '../types.ts';
import { call, parse, type Deps } from './call.ts';

const speak = z.looseObject({ text: z.string() });

/**
 * `AudioClip` (claude-code/index.d.ts:787): the plugin's own file `{ asset }`, a URL the engine
 * fetches, or the bytes as base64 with their MIME type.
 */
const clip = z.union([
  z.object({ asset: z.string() }),
  z.object({ url: z.string() }),
  z.object({ base64: z.string(), mime: z.string() }),
]);

/** `PlayOptions` (:8158): a loop needs the signal that stops it; `gain` from 0 to 4. */
const options = z
  .object({
    shouldLoop: z.boolean().optional(),
    gain: z.number().min(0).max(4).optional(),
    signal: z.instanceof(AbortSignal).optional(),
  })
  .refine((given) => given.shouldLoop !== true || given.signal !== undefined, {
    message: 'shouldLoop takes the signal that stops it',
  });

/** The event of `$.audio.play` (:7327): the clip and how to play it; "the signal does not cross". */
const play = z.looseObject({ clip, shouldLoop: z.boolean(), gain: z.number().optional() });

export const audioApi = (deps: Deps): ModsNamespaceApi<'audio'> => ({
  play: async (...args) => {
    const given = parse('$.audio.play', options, args[1] ?? {});
    const input = {
      clip: parse('$.audio.play', clip, args[0]),
      shouldLoop: given.shouldLoop ?? false,
      ...(given.gain === undefined ? {} : { gain: given.gain }),
    };
    return call(deps, 'audio.play', input, (e) =>
      deps.ports.audio.play(parse('$.audio.play', play, e), given.signal ?? deps.signal),
    );
  },
  // "which synthesizer spoke, once the utterance has ended" (claude-code/index.d.ts:2839): the platform's own.
  speak: async (...args) =>
    call(deps, 'audio.speak', { text: parse('$.audio.speak', z.string(), args[0]) }, async (e) => {
      await deps.ports.audio.speak(parse('$.audio.speak', speak, e).text);
      return { via: 'system' };
    }),
});
