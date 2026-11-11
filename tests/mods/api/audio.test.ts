/**
 * `$.audio` (claude-code/index.d.ts:2814, :2828): `play(clip, options?)` fires `{ clip, shouldLoop,
 * gain? }`; `speak(text)` reaches the host's synthesizer.
 */
import { expect, test } from 'bun:test';
import { MODS_API } from '../../../src/protocol/mods-api-names.ts';
import { apiHarness, expectMethods } from '../../support/mods-api.ts';
import { rejection } from '../../support/rejection.ts';
import { spec } from '../../support/spec.ts';

spec('mods.api.$.audio', () => {
  test('$.audio has play and speak, which reach the host', async () => {
    const heard: unknown[] = [];
    const audio = {
      play: (request: unknown) => (heard.push(['play', request]), Promise.resolve()),
      speak: (text: string) => (heard.push(['speak', text]), Promise.resolve()),
    };
    const h = await apiHarness({ ports: { audio } });
    expectMethods(h.api.audio, MODS_API.audio);
    await h.api.audio.speak('build finished');
    await h.api.audio.play({ asset: 'sounds/done.wav' }, { gain: 2 });
    expect(heard).toEqual([
      ['speak', 'build finished'],
      ['play', { clip: { asset: 'sounds/done.wav' }, shouldLoop: false, gain: 2 }],
    ]);
  });

  test('play takes one of the three clips, and a loop only with the signal that stops it (claude-code/index.d.ts:787, :8158)', async () => {
    const h = await apiHarness({
      ports: { audio: { play: () => Promise.resolve(), speak: () => Promise.resolve() } },
    });
    expect(await rejection(h.api.audio.play({ sound: 'done' }))).toContain('$.audio.play');
    expect(
      await rejection(h.api.audio.play({ url: 'https://x/a.wav' }, { shouldLoop: true })),
    ).toContain('shouldLoop takes the signal that stops it');
  });

  test('speak with something that is not text rejects', async () => {
    const h = await apiHarness({
      ports: { audio: { play: () => Promise.resolve(), speak: () => Promise.resolve() } },
    });
    expect(await rejection(h.api.audio.speak(5))).toContain('$.audio.speak');
  });
});
