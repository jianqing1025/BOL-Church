import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Video as VideoIcon, VideoOff, ScreenShare, PhoneOff } from 'lucide-react';
import type { Participant } from 'livekit-client';
import { LiveKitService } from '../../services/livekitService';
import { useLocalization } from '../../hooks/useLocalization';
import type { MeetingRoom } from '../../constants/meetingRooms';

interface VideoPanelProps {
  room: MeetingRoom;
  name: string;
  password: string;
}

const ParticipantTile: React.FC<{ participant: Participant }> = ({ participant }) => {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    return LiveKitService.attachVideo(participant, ref.current);
  }, [participant]);
  return (
    <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
      <video ref={ref} autoPlay playsInline muted={participant.isLocal} className="h-full w-full object-cover" />
      <span className="absolute bottom-1 left-2 text-xs font-semibold text-white drop-shadow">
        {participant.name || participant.identity}
      </span>
    </div>
  );
};

export const VideoPanel: React.FC<VideoPanelProps> = ({ room, name, password }) => {
  const { t } = useLocalization();
  const serviceRef = useRef<LiveKitService | null>(null);
  const [joined, setJoined] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  useEffect(() => () => { serviceRef.current?.disconnect(); serviceRef.current = null; }, []);

  if (!room.hasVideo) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg bg-gray-100 text-sm text-gray-500">
        {t('meeting.lobbyChatOnly')}
      </div>
    );
  }

  const join = async () => {
    setConnecting(true);
    setError('');
    const service = new LiveKitService({
      onParticipantsChanged: (p) => setParticipants([...p]),
      onError: (e) => setError(e instanceof Error ? e.message : String(e)),
    });
    serviceRef.current = service;
    try {
      await service.connect({ roomId: room.id, name, password });
      setJoined(true);
      setMicOn(service.localParticipant?.isMicrophoneEnabled ?? true);
      setCamOn(service.localParticipant?.isCameraEnabled ?? true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      service.disconnect();
      serviceRef.current = null;
    } finally {
      setConnecting(false);
    }
  };

  const leave = () => {
    serviceRef.current?.disconnect();
    serviceRef.current = null;
    setJoined(false);
    setParticipants([]);
  };

  if (!joined) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 rounded-lg bg-gray-900 p-6 text-center">
        <p className="text-sm text-gray-300">{room.name}</p>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          type="button"
          onClick={join}
          disabled={connecting}
          className="flex items-center gap-2 rounded-lg bg-green-600 px-6 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
        >
          <VideoIcon size={18} />
          {connecting ? t('meeting.videoConnecting') : t('meeting.joinVideo')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col rounded-lg bg-gray-900 p-3">
      <div className="grid flex-1 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
        {participants.map((p) => <ParticipantTile key={p.sid || p.identity} participant={p} />)}
      </div>
      <div className="mt-3 flex items-center justify-center gap-3">
        <button type="button" onClick={async () => setMicOn(await serviceRef.current!.toggleMic())}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-700 text-white hover:bg-gray-600" aria-label="mic">
          {micOn ? <Mic size={18} /> : <MicOff size={18} className="text-red-400" />}
        </button>
        <button type="button" onClick={async () => setCamOn(await serviceRef.current!.toggleCamera())}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-700 text-white hover:bg-gray-600" aria-label="camera">
          {camOn ? <VideoIcon size={18} /> : <VideoOff size={18} className="text-red-400" />}
        </button>
        <button type="button" onClick={() => serviceRef.current?.toggleScreenShare()}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-700 text-white hover:bg-gray-600" aria-label="screen share">
          <ScreenShare size={18} />
        </button>
        <button type="button" onClick={leave}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700" aria-label="leave">
          <PhoneOff size={18} />
        </button>
      </div>
    </div>
  );
};

export default VideoPanel;
