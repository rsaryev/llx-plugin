import { z } from 'zod';
import type { ModsNamespaceApi } from '../types.ts';
import { call, parse, type Deps } from './call.ts';

const speak = z.looseObject({ text: z.string() });
// Judgment: the docs name `play` and `speak` and no argument, so `play` takes one object and hands it on.
const play = z.looseObject({});

export const audioApi = (deps: Deps): ModsNamespaceApi<'audio'> => ({
  play: async (...args) =>
    call(deps, 'audio.play', parse('$.audio.play', play, args[0]), (e) =>
      deps.ports.audio.play(parse('$.audio.play', play, e)),
    ),
  speak: async (...args) =>
    call(deps, 'audio.speak', { text: parse('$.audio.speak', z.string(), args[0]) }, (e) =>
      deps.ports.audio.speak(parse('$.audio.speak', speak, e).text),
    ),
});
