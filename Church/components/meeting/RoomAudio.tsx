import React, { useEffect, useRef } from 'react';
import type { Participant, Track } from 'livekit-client';
import { LiveKitService } from '../../services/livekitService';

/**
 * One <audio> element bound to one remote track. A WebRTC track makes no sound
 * on its own — it is silent until it is attached to a media element — so this
 * element existing is the whole of "this person can be heard".
 */
const TrackAudio: React.FC<{ track: Track }> = ({ track }) => {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => { try { track.detach(el); } catch { /* ignore */ } };
  }, [track]);
  return <audio ref={ref} autoPlay />;
};

/**
 * The room's sound, rendered once and independently of the layout.
 *
 * This used to live in the participant tile, which made being audible a side
 * effect of being drawn: page two of the gallery, or anyone bumped off a
 * screen-share rail, went silent for that viewer only — and because every
 * device fits a different number of tiles, the same speaker was heard by some
 * people and not others. Keeping playback here, above the layout, is what
 * makes it the same for everybody in the room.
 */
export const RoomAudio: React.FC<{ participants: Participant[] }> = ({ participants }) => (
  <>
    {LiveKitService.roomAudioTracks(participants).map((track) => (
      <TrackAudio key={track.sid ?? track.mediaStreamID} track={track} />
    ))}
  </>
);

export default RoomAudio;
