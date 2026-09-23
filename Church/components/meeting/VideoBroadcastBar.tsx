import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useLocalization } from '../../hooks/useLocalization';

interface VideoBroadcastBarProps {
  file: File;
  /** Publish the element once it is playing. Returning false means it was blocked. */
  onReady: (element: HTMLVideoElement) => Promise<boolean>;
  onStop: () => void;
}

/**
 * The presenter's own view of the video they are broadcasting.
 *
 * This element is the source of the published tracks, so it must stay mounted
 * and playing for the room to keep receiving the picture — the native controls
 * on it are what everyone else's playback follows.
 */
export const VideoBroadcastBar: React.FC<VideoBroadcastBarProps> = ({ file, onReady, onStop }) => {
  const { t } = useLocalization();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState('');

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  // Read through refs so the effect below belongs to the file, not to the
  // render. Its callers rebuild these every render — and the meeting's elapsed
  // clock forces a render every second — so depending on them directly re-ran
  // the effect once a second: re-attaching the listener and calling play()
  // again. On a film that had finished, that play() started it over, which
  // looked like looping, and the republish that followed was met with "someone
  // else is sharing" — about the viewer's own share.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onStopRef = useRef(onStop);
  onStopRef.current = onStop;

  // Publish once the file is actually playing: capturing before the first frame
  // can hand LiveKit an empty track, which arrives as a black screen.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !url) return;
    let cancelled = false;

    const publish = async () => {
      if (cancelled) return;
      el.removeEventListener('playing', publish);
      const ok = await onReadyRef.current(el);
      if (!ok && !cancelled) onStopRef.current();
    };

    // A film that has run out has nothing left to share; leaving it published
    // would hold the room's one shared picture on a still frame.
    const finish = () => { if (!cancelled) onStopRef.current(); };

    el.addEventListener('playing', publish);
    el.addEventListener('ended', finish);
    void el.play().catch(() => { /* the user can press play on the controls */ });
    return () => {
      cancelled = true;
      el.removeEventListener('playing', publish);
      el.removeEventListener('ended', finish);
    };
  }, [url]);

  return (
    <div className="flex shrink-0 items-center gap-3 border-t border-white/10 bg-gray-900 px-3 py-2">
      <video
        ref={videoRef}
        src={url || undefined}
        controls
        playsInline
        className="h-20 w-36 shrink-0 rounded-lg bg-black object-contain sm:h-24 sm:w-44"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-100">{file.name}</p>
        <p className="mt-0.5 text-xs text-gray-400">{t('meeting.videoFileHint')}</p>
      </div>
      <button
        type="button"
        onClick={onStop}
        className="flex shrink-0 items-center gap-1.5 rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700"
      >
        <X size={14} />
        {t('meeting.videoFileStop')}
      </button>
    </div>
  );
};

export default VideoBroadcastBar;
