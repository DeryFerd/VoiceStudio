import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { NowPlayingDock, PlayInDockButton } from './now-playing-dock';
import { closeDock, nowPlayingStore } from '@/lib/store/now-playing';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/waveform-player', () => ({
  WaveformPlayer: ({ src, source }: { src: string; source: string }) => (
    <div data-testid="waveform" data-src={src} data-source={source} />
  ),
}));

afterEach(() => {
  cleanup();
  closeDock();
});

it('plays a row clip in the bottom player and closes it', () => {
  render(
    <>
      <PlayInDockButton src="/audio/a.wav" source="take-1" title="Welcome aboard" subtitle="Clone" />
      <NowPlayingDock />
    </>,
  );
  expect(screen.queryByRole('region', { name: 'player.now_playing' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'player.play' }));
  const dock = screen.getByRole('region', { name: 'player.now_playing' });
  expect(dock).toHaveTextContent('Welcome aboard');
  expect(screen.getByTestId('waveform')).toHaveAttribute('data-source', 'take-1');
  fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
  expect(nowPlayingStore.state).toBeNull();
  expect(screen.queryByRole('region', { name: 'player.now_playing' })).toBeNull();
});

it('restarts the same clip when played again', () => {
  render(<PlayInDockButton src="/audio/a.wav" source="take-1" title="A" />);
  fireEvent.click(screen.getByRole('button', { name: 'player.play' }));
  const first = nowPlayingStore.state!.nonce;
  fireEvent.click(screen.getByRole('button', { name: 'player.play' }));
  expect(nowPlayingStore.state!.nonce).toBe(first + 1);
});
