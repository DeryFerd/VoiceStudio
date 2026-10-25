import { AudioLinesIcon, PauseIcon, PlayIcon, XIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { WaveformPlayer } from '@/components/waveform-player';
import { stopActivePlayback, usePlaybackSource } from '@/lib/audio/playback';
import { closeDock, playInDock, useNowPlaying, type NowPlaying } from '@/lib/store/now-playing';
import { cn } from '@/lib/utils';

/**
 * App-wide bottom player. Takes and renders opened from lists play here with
 * the same waveform player as Latest take, so playback keeps going while the
 * user moves between pages.
 */
export function NowPlayingDock() {
  const { t } = useTranslation();
  const clip = useNowPlaying();
  if (!clip) return null;
  return (
    <section
      aria-label={t('player.now_playing')}
      data-slot="now-playing-dock"
      className="flex shrink-0 items-center gap-3 border-t border-border/60 bg-muted/20 px-4 py-2 backdrop-blur-xl"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <AudioLinesIcon className="size-4" aria-hidden="true" />
      </span>
      <div className="w-56 min-w-0 shrink">
        <p className="truncate text-sm font-medium" title={clip.title}>
          {clip.title}
        </p>
        {clip.subtitle && (
          <p className="truncate text-xs text-muted-foreground">{clip.subtitle}</p>
        )}
      </div>
      <WaveformPlayer
        key={clip.nonce}
        src={clip.src}
        source={clip.source}
        autoPlay
        compact
        height={32}
        className="min-w-0 flex-1"
      />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t('common.close')}
        title={t('common.close')}
        onClick={() => {
          stopActivePlayback();
          closeDock();
        }}
      >
        <XIcon />
      </Button>
    </section>
  );
}

/** Row play button that sends a clip to the bottom player; pressing it again pauses. */
export function PlayInDockButton({
  className,
  ...clip
}: Omit<NowPlaying, 'nonce'> & { className?: string }) {
  const { t } = useTranslation();
  const playing = usePlaybackSource() === clip.source;
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={t(playing ? 'player.pause' : 'player.play')}
      title={t(playing ? 'player.pause' : 'player.play')}
      aria-pressed={playing}
      onClick={() => (playing ? stopActivePlayback() : playInDock(clip))}
      className={cn(playing && 'text-primary', className)}
    >
      {playing ? <PauseIcon /> : <PlayIcon />}
    </Button>
  );
}
