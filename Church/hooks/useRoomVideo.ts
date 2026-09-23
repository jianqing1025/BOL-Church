import { useCallback, useState } from 'react';
import type { RoomVideoMessage } from '../meeting/chatProtocol';
import type { PlaybackState } from '../meeting/youtube';

/** The leader's position, with a sequence so an identical repeat still fires. */
export interface LeaderPlayback extends PlaybackState {
  seq: number;
}

export interface RoomVideo {
  /** The video the room is watching, or null when nothing is on. */
  videoId: string | null;
  /** Where to start a player that has just been created. */
  startSeconds: number;
  /** The leader's latest position, or null until they report one. */
  leader: LeaderPlayback | null;
  /**
   * Whether this participant's playback reaches the rest of the room — true
   * only for whoever opened the video.
   */
  canLead: boolean;
  open: (videoId: string, startSeconds?: number) => void;
  close: () => void;
  /** Report where this leader is, so the room can follow. */
  report: (state: PlaybackState) => void;
  /** Apply an update that arrived from the room. */
  apply: (message: RoomVideoMessage) => void;
}

/**
 * The video the room is watching together on YouTube.
 *
 * Nothing about the picture travels through LiveKit — a cross-origin iframe
 * cannot be captured and republished the way a local file can — so every
 * participant runs their own player and this carries the leader's position to
 * the rest. Opening one is gated on the room's shared picture being free
 * rather than on a host being absent: a host who is showing nothing should not
 * stop everyone else from showing something.
 *
 * Followers are not locked out of their own scrubber on purpose. Dragging it
 * pulls you off the group, and the leader's next heartbeat (three seconds at
 * most) pulls you back — which is easier to understand than a control that
 * refuses to move, and harmless if someone wants to glance back a few seconds.
 *
 * Exactly one participant leads: the one who opened the video, as the room
 * object decided. It cannot be worked out from who is a host, because someone
 * joining midway has not been told who the hosts are yet — and a newcomer who
 * believed themselves the leader would broadcast a position of zero and pull
 * the whole room back to the start.
 */
export function useRoomVideo(send: (message: RoomVideoMessage) => void, ownUserId: string | null): RoomVideo {
  const [videoId, setVideoId] = useState<string | null>(null);
  const [leaderId, setLeaderId] = useState<string | null>(null);
  const [startSeconds, setStartSeconds] = useState(0);
  const [leader, setLeader] = useState<LeaderPlayback | null>(null);

  const apply = useCallback((message: RoomVideoMessage) => {
    if (message.action === 'close') {
      setVideoId(null);
      setLeader(null);
      setLeaderId(null);
      return;
    }
    if (message.action === 'open') {
      setVideoId(message.videoId);
      setStartSeconds(message.startSeconds ?? 0);
      // Opening *is* the room starting to watch, which is how the room object
      // records it too. Leaving this null until the first heartbeat gave
      // followers nothing to follow for up to three seconds — long enough for
      // someone to press YouTube's own play button and end up watching alone.
      setLeaderId(message.leaderId ?? null);
      setLeader((prev) => ({ playing: true, seconds: message.startSeconds ?? 0, seq: (prev?.seq ?? 0) + 1 }));
      return;
    }
    setLeader((prev) => ({ playing: message.playing, seconds: message.seconds, seq: (prev?.seq ?? 0) + 1 }));
  }, []);

  // The room's own message comes back through apply(), so the leader's state
  // is set from the same path as everyone else's — one way for it to change.
  const open = useCallback((id: string, start?: number) => {
    send({ type: 'video', action: 'open', videoId: id, ...(start ? { startSeconds: start } : {}) });
  }, [send]);

  const close = useCallback(() => {
    send({ type: 'video', action: 'close' });
  }, [send]);

  const report = useCallback((state: PlaybackState) => {
    send({ type: 'video', action: 'state', playing: state.playing, seconds: Math.max(0, Math.round(state.seconds)) });
  }, [send]);

  const canLead = leaderId !== null && leaderId === ownUserId;

  return { videoId, startSeconds, leader, canLead, open, close, report, apply };
}
