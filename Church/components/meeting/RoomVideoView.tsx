import React, { useEffect, useRef, useState } from 'react';
import { Play, Volume2, VolumeX } from 'lucide-react';
import type { Participant } from 'livekit-client';
import { useLocalization } from '../../hooks/useLocalization';
import { canSetMediaVolume, followRoomVideo, type PlaybackState } from '../../meeting/youtube';
import type { LeaderPlayback } from '../../hooks/useRoomVideo';
import { ParticipantTile } from './ParticipantTile';

/** Only the handful of the YouTube IFrame API this view actually uses. */
interface YouTubePlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getPlayerState(): number;
  mute(): void;
  unMute(): void;
  setVolume(volume: number): void;
  destroy(): void;
}
interface YouTubeApi {
  Player: new (host: HTMLElement, options: unknown) => YouTubePlayer;
}
declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** YT.PlayerState values, named so the checks below read as English. */
const PLAYING = 1;
const BUFFERING = 3;
const PAUSED = 2;
const ENDED = 0;

/**
 * Loads the YouTube IFrame API once for the whole page.
 *
 * The API announces itself through a single global callback, so a second
 * <script> would never fire and a second caller would wait forever — hence one
 * shared promise. A failure clears it so a later attempt can try again.
 */
let apiPromise: Promise<YouTubeApi> | null = null;
function loadYouTubeApi(): Promise<YouTubeApi> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YouTubeApi>((resolve, reject) => {
    if (window.YT?.Player) { resolve(window.YT); return; }
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) resolve(window.YT);
      else reject(new Error('YouTube API loaded without a player'));
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => reject(new Error('YouTube is unreachable'));
    document.head.appendChild(script);
  });
  return apiPromise.catch((error) => { apiPromise = null; throw error; });
}

interface RoomVideoViewProps {
  videoId: string;
  startSeconds: number;
  leader: LeaderPlayback | null;
  canLead: boolean;
  onReport: (state: PlaybackState) => void;
  participants: Participant[];
  speaking: Set<string>;
  handOrders: Map<string, number>;
  onLowerHand?: (identity: string) => void;
}

/**
 * The video the room is watching together, filling the stage with the others
 * on a thumbnail rail — the same shape as a shared screen, so nobody has to
 * learn a second layout for "everyone is looking at this".
 *
 * Each participant runs their own player. The leader's position is reported
 * outward; everyone else's player follows it.
 */
export const RoomVideoView: React.FC<RoomVideoViewProps> = ({
  videoId, startSeconds, leader, canLead, onReport, participants, speaking, handOrders, onLowerHand,
}) => {
  const { t } = useLocalization();
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [blocked, setBlocked] = useState(false);
  /**
   * Starts silent on purpose. iOS refuses to start audible playback that no
   * tap asked for, and a follower's playback is started by a message from the
   * room — so an audible player would simply not start, leaving that person
   * out of step with everyone else. Silent, it starts and stays in step, and
   * the one tap they make is only to turn the sound on.
   */
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(100);
  const volumeAdjustable = typeof navigator !== 'undefined' && canSetMediaVolume(navigator.userAgent);

  // Read through refs so the player is built once per video rather than torn
  // down and rebuilt — which would restart the film — whenever a prop changes.
  const canLeadRef = useRef(canLead);
  canLeadRef.current = canLead;
  const onReportRef = useRef(onReport);
  onReportRef.current = onReport;
  const startRef = useRef(startSeconds);
  startRef.current = startSeconds;
  const leaderRef = useRef(leader);
  leaderRef.current = leader;

  useEffect(() => {
    let cancelled = false;
    let player: YouTubePlayer | null = null;
    setReady(false);
    setFailed(false);
    setBlocked(false);

    void loadYouTubeApi().then((YT) => {
      if (cancelled || !hostRef.current) return;
      player = new YT.Player(hostRef.current, {
        videoId,
        // autoplay asks; whether it is granted is the browser's call, and the
        // tap-to-play cover below is what answers when it refuses.
        playerVars: { autoplay: 1, mute: 1, playsinline: 1, rel: 0, modestbranding: 1, start: Math.round(startRef.current) },
        events: {
          onReady: () => { if (!cancelled) { setReady(true); setMuted(true); } },
          onStateChange: (event: { data: number }) => {
            // Only the leader speaks; everyone else's player is an echo, and
            // reporting from all of them would fight over the room's position.
            if (!canLeadRef.current || !player) return;
            if (event.data !== PLAYING && event.data !== PAUSED && event.data !== ENDED) return;
            onReportRef.current({ playing: event.data === PLAYING, seconds: player.getCurrentTime() });
          },
        },
      });
      playerRef.current = player;
    }).catch(() => { if (!cancelled) setFailed(true); });

    return () => {
      cancelled = true;
      try { player?.destroy(); } catch { /* already gone with the iframe */ }
      playerRef.current = null;
    };
  }, [videoId]);

  // The leader's heartbeat. Without it a follower who drifted — or who joined
  // midway — would stay adrift until the leader next touched the controls.
  useEffect(() => {
    if (!canLead || !ready) return;
    const id = window.setInterval(() => {
      const player = playerRef.current;
      if (!player || player.getPlayerState() !== PLAYING) return;
      onReportRef.current({ playing: true, seconds: player.getCurrentTime() });
    }, 3000);
    return () => window.clearInterval(id);
  }, [canLead, ready]);

  const leaderSeq = leader?.seq;
  const leaderPlaying = leader?.playing;

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !ready || canLead || !leader) return;
    const decision = followRoomVideo(
      { playing: player.getPlayerState() === PLAYING, seconds: player.getCurrentTime() },
      { playing: leader.playing, seconds: leader.seconds },
    );
    if (decision.seekTo !== null) player.seekTo(decision.seekTo, true);
    if (decision.setPlaying === true) player.playVideo();
    if (decision.setPlaying === false) player.pauseVideo();
    // leader is read fresh each time the sequence moves; depending on the
    // object itself would re-run this on every unrelated render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderSeq, ready, canLead]);

  // Playback nobody tapped for is refused by Safari, and by Chrome when the
  // tab has not earned it. Check shortly after and, if nothing started, ask
  // for the tap plainly instead of leaving a silent black rectangle. The
  // leader needs this as much as anyone: their own player is just as likely to
  // be refused, and without it they go hunting for YouTube's own play button —
  // which starts playback outside the room's knowledge entirely.
  useEffect(() => {
    if (!ready || !leaderPlaying) { setBlocked(false); return; }
    const id = window.setTimeout(() => {
      const state = playerRef.current?.getPlayerState();
      setBlocked(state !== PLAYING && state !== BUFFERING);
    }, 1200);
    return () => window.clearTimeout(id);
  }, [ready, leaderSeq, leaderPlaying]);

  const turnSoundOn = () => {
    const player = playerRef.current;
    if (!player) return;
    // Inside the tap, so iOS allows the sound it refused a moment ago.
    player.unMute();
    if (volumeAdjustable) player.setVolume(volume);
    player.playVideo();
    setMuted(false);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 md:flex-row">
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-black">
        <div className="flex h-full w-full items-center justify-center">
          <div className="aspect-video max-h-full w-full max-w-full">
            <div ref={hostRef} className="h-full w-full" />
          </div>
        </div>

        {failed && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
            <p className="text-sm text-red-200">{t('meeting.youtubeUnavailable')}</p>
          </div>
        )}

        {blocked && (
          <button
            type="button"
            onClick={() => {
              const player = playerRef.current;
              // Join the room where it is now. Playing from wherever this
              // player happened to be parked is how someone ends up watching
              // the same film several minutes behind everyone else.
              const at = leaderRef.current?.seconds;
              if (player && at !== undefined) player.seekTo(at, true);
              turnSoundOn();
              setBlocked(false);
            }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/65 text-white"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/15">
              <Play size={30} />
            </span>
            <span className="text-sm font-semibold">{t('meeting.videoTapToPlay')}</span>
          </button>
        )}

        {/* The sound control. Prominent while silent, because a muted video is
            the normal way this starts and nobody should have to guess why. */}
        {!failed && !blocked && (
          <div className="absolute right-3 top-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (muted) { turnSoundOn(); return; }
                playerRef.current?.mute();
                setMuted(true);
              }}
              className={`flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold shadow-lg transition-colors ${
                muted ? 'bg-amber-400 text-gray-900 hover:bg-amber-300' : 'bg-black/60 text-white hover:bg-black/75'
              }`}
            >
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              <span>{t(muted ? 'meeting.videoSoundOn' : 'meeting.videoSoundOff')}</span>
            </button>

            {/* Slider first, so it grows leftwards and the button stays put. */}
            {volumeAdjustable && !muted && (
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                aria-label={t('meeting.videoVolume')}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setVolume(next);
                  playerRef.current?.setVolume(next);
                }}
                className="h-1.5 w-24 cursor-pointer accent-white"
              />
            )}
          </div>
        )}

        {/* Where a slider would be pointless, say why rather than leave the
            person pressing buttons that cannot help them. */}
        {!failed && !blocked && !muted && !volumeAdjustable && (
          <p className="pointer-events-none absolute right-3 top-16 max-w-[15rem] rounded-lg bg-black/60 px-2.5 py-1.5 text-right text-[11px] leading-snug text-gray-200">
            {t('meeting.videoVolumeHardware')}
          </p>
        )}
      </div>

      <div className="flex shrink-0 gap-2 overflow-x-auto md:w-44 md:flex-col md:overflow-x-visible md:overflow-y-auto">
        {participants.map((p) => (
          <div key={p.sid || p.identity} className="aspect-video w-28 shrink-0 md:w-full">
            <ParticipantTile
              participant={p}
              speaking={speaking.has(p.identity)}
              handOrder={handOrders.get(p.identity)}
              onLowerHand={onLowerHand && (() => onLowerHand(p.identity))}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default RoomVideoView;
