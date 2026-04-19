import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Mic } from 'lucide-react';

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const SPEEDS = [1, 1.5, 2] as const;
const BAR_COUNT = 32;

interface AudioPlayerProps {
  src: string;
  accentColor?: string;
  isClient?: boolean;
}

export function AudioPlayer({ src, accentColor = 'var(--accent)', isClient = false }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState<1 | 1.5 | 2>(1);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoaded = () => {
      // Alguns .ogg do WhatsApp retornam Infinity — workaround usando seek
      if (!isFinite(audio.duration)) {
        audio.currentTime = 1e101;
        audio.ontimeupdate = () => {
          audio.ontimeupdate = null;
          audio.currentTime = 0;
          setDuration(audio.duration);
          setLoaded(true);
        };
      } else {
        setDuration(audio.duration);
        setLoaded(true);
      }
    };
    const onTime = () => setCurrentTime(audio.currentTime);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => { setPlaying(false); setCurrentTime(0); };

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
    };
  }, [src]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  };

  const cycleSpeed = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const idx = SPEEDS.indexOf(speed);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    audio.playbackRate = next;
    setSpeed(next);
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !loaded) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audio.currentTime = Math.max(0, Math.min(duration, pct * duration));
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // "Waveform" pseudo-aleatório determinístico baseado no src
  const barHeights = Array.from({ length: BAR_COUNT }, (_, i) => {
    const seed = src.charCodeAt(i % src.length) + i * 7;
    return 30 + ((seed * 9301 + 49297) % 233) / 233 * 70;
  });

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '6px 10px',
      minWidth: 240,
      maxWidth: 320,
    }}>
      <audio ref={audioRef} src={src} preload="metadata" style={{ display: 'none' }} />

      {/* Play/Pause button */}
      <button
        onClick={togglePlay}
        aria-label={playing ? 'Pausar' : 'Reproduzir'}
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: accentColor,
          color: isClient ? 'var(--strong-text)' : '#000',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'transform 0.15s, filter 0.15s',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.1)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1)'; }}
      >
        {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" style={{ marginLeft: 2 }} />}
      </button>

      {/* Waveform + progress */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <div
          onClick={seek}
          style={{
            position: 'relative',
            height: 24,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            cursor: loaded ? 'pointer' : 'default',
          }}
        >
          {barHeights.map((h, i) => {
            const barPct = ((i + 1) / BAR_COUNT) * 100;
            const filled = barPct <= progress;
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: `${h}%`,
                  borderRadius: 1,
                  background: filled ? accentColor : 'var(--fg-faint)',
                  opacity: filled ? 1 : 0.45,
                  transition: 'background 0.1s, opacity 0.1s',
                  minHeight: 2,
                }}
              />
            );
          })}
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 10,
          color: 'var(--fg-subtle)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Mic size={10} style={{ color: accentColor }} />
            {formatTime(playing || currentTime > 0 ? currentTime : duration)}
          </span>
          <button
            onClick={cycleSpeed}
            style={{
              padding: '1px 6px',
              borderRadius: 4,
              background: speed === 1 ? 'transparent' : `${accentColor}22`,
              border: `1px solid ${speed === 1 ? 'var(--border)' : accentColor + '55'}`,
              color: speed === 1 ? 'var(--fg-subtle)' : accentColor,
              fontSize: 9,
              fontWeight: 700,
              cursor: 'pointer',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {speed}x
          </button>
        </div>
      </div>
    </div>
  );
}
