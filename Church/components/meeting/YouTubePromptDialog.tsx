import React, { useEffect, useRef, useState } from 'react';
import { Youtube } from 'lucide-react';
import { useLocalization } from '../../hooks/useLocalization';
import { parseYouTubeStart, parseYouTubeVideoId } from '../../meeting/youtube';

/** Seconds as m:ss, or h:mm:ss once a link points past the hour. */
function formatStart(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

interface YouTubePromptDialogProps {
  onCancel: () => void;
  onPlay: (videoId: string, startSeconds?: number) => void;
}

/**
 * Asks for the link to play for the whole room.
 *
 * Purpose-built rather than the site-wide prompt, which cannot take Chinese
 * button labels, turns its message into the heading, and answers a mistyped
 * link with a second dialog after the fact. Here the link is read as it is
 * typed: the thumbnail is what catches the wrong video — the one in the
 * playlist you did not mean — before the whole room is looking at it.
 */
export const YouTubePromptDialog: React.FC<YouTubePromptDialogProps> = ({ onCancel, onPlay }) => {
  const { t } = useLocalization();
  const [text, setText] = useState('');
  const [thumbBroken, setThumbBroken] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const videoId = parseYouTubeVideoId(text);
  const startSeconds = videoId ? parseYouTubeStart(text) : undefined;
  const typedButWrong = text.trim() !== '' && videoId === null;

  useEffect(() => { setThumbBroken(false); }, [videoId]);

  const play = () => { if (videoId) onPlay(videoId, startSeconds); };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 px-4 py-6">
      <div className="w-full max-w-md rounded-[10px] bg-white p-7 shadow-2xl">
        <div className="mb-1.5 flex items-center gap-3">
          <Youtube size={26} className="shrink-0 text-red-600" />
          <h2 className="text-xl font-extrabold text-gray-800">{t('meeting.youtubeTitle')}</h2>
        </div>
        <p className="mb-5 text-sm leading-6 text-gray-500">{t('meeting.youtubeSubtitle')}</p>

        <input
          ref={inputRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') play();
            if (event.key === 'Escape') onCancel();
          }}
          placeholder={t('meeting.youtubePlaceholder')}
          className={`h-12 w-full rounded-lg border bg-gray-50 px-4 text-sm text-gray-700 outline-none transition-colors ${
            videoId ? 'border-emerald-400' : 'border-gray-200 focus:border-gray-400'
          }`}
        />

        {videoId && (
          <div className="mt-3 flex items-center gap-3 rounded-lg bg-gray-100 p-2.5">
            {!thumbBroken && (
              <img
                src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
                alt=""
                onError={() => setThumbBroken(true)}
                className="h-[52px] w-[92px] shrink-0 rounded-md bg-gray-300 object-cover"
              />
            )}
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-700">{t('meeting.youtubeRecognised')}</p>
              {startSeconds !== undefined && (
                <p className="mt-0.5 text-xs text-gray-500">
                  {t('meeting.youtubeStartAt').replace('{time}', formatStart(startSeconds))}
                </p>
              )}
            </div>
          </div>
        )}

        {typedButWrong && <p className="mt-3 text-xs text-red-500">{t('meeting.youtubeBadLink')}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50"
          >
            {t('meeting.cancel')}
          </button>
          <button
            type="button"
            onClick={play}
            disabled={!videoId}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {t('meeting.youtubePlay')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default YouTubePromptDialog;
