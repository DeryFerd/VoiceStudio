import { expect, it, vi } from 'vitest';
import { subscribeMediaPaused, waveformUrl } from './waveform-player';

it('tracks the native media element play and pause state for its button', () => {
  const media = Object.assign(new EventTarget(), { paused: true });
  const onPaused = vi.fn();
  const unsubscribe = subscribeMediaPaused(media as HTMLMediaElement, onPaused);

  media.paused = false;
  media.dispatchEvent(new Event('playing'));
  media.paused = true;
  media.dispatchEvent(new Event('pause'));

  expect(onPaused.mock.calls.map(([paused]) => paused)).toEqual([true, false, true]);

  unsubscribe();
  media.paused = false;
  media.dispatchEvent(new Event('playing'));
  expect(onPaused).toHaveBeenCalledTimes(3);
});

it('hands WaveSurfer the exact source the media element reports, so it never swaps it', () => {
  const media = document.createElement('audio');
  for (const src of ['/api/audio/take%201.wav', 'blob:http://localhost/abc', 'http://127.0.0.1:8000/api/audio/a.wav']) {
    media.src = src;
    expect(waveformUrl(src)).toBe(media.src);
  }
});
