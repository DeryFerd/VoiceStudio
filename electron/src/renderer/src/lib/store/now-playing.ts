import { Store } from '@tanstack/store';
import { useStore } from '@tanstack/react-store';

/** A clip played in the app-wide bottom player (recent takes, project takes and renders). */
export interface NowPlaying {
  src: string;
  /** Playback slot name; the play buttons compare against it to show their state. */
  source: string;
  title: string;
  subtitle?: string;
  /** Bumped on every play so replaying the same clip restarts it. */
  nonce: number;
}

export const nowPlayingStore = new Store<NowPlaying | null>(null);

export function useNowPlaying(): NowPlaying | null {
  return useStore(nowPlayingStore);
}

export function playInDock(clip: Omit<NowPlaying, 'nonce'>): void {
  nowPlayingStore.setState((previous) => ({ ...clip, nonce: (previous?.nonce ?? 0) + 1 }));
}

export function closeDock(): void {
  nowPlayingStore.setState(() => null);
}
