import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useLocalization } from '../../hooks/useLocalization';
import { navigateTo } from '../../utils/routes';
import type { MeetingRoom as MeetingRoomConfig } from '../../constants/meetingRooms';

const JITSI_DOMAIN = 'meet.jit.si';
const JITSI_SCRIPT_SRC = `https://${JITSI_DOMAIN}/external_api.js`;

type JitsiApi = { dispose: () => void };
type JitsiApiCtor = new (domain: string, options: Record<string, unknown>) => JitsiApi;

declare global {
  interface Window { JitsiMeetExternalAPI?: JitsiApiCtor }
}

// Shared loader so the script is injected once even across remounts / StrictMode.
let scriptPromise: Promise<void> | null = null;
function loadJitsiScript(): Promise<void> {
  if (typeof window !== 'undefined' && window.JitsiMeetExternalAPI) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = JITSI_SCRIPT_SRC;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => { scriptPromise = null; reject(new Error('jitsi-script-failed')); };
    document.body.appendChild(el);
  });
  return scriptPromise;
}

interface MeetingRoomProps {
  room: MeetingRoomConfig;
  displayName: string;
  title: string;
}

export const MeetingRoom: React.FC<MeetingRoomProps> = ({ room, displayName, title }) => {
  const { t } = useLocalization();
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiApi | null>(null);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    loadJitsiScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.JitsiMeetExternalAPI) return;
        apiRef.current = new window.JitsiMeetExternalAPI(JITSI_DOMAIN, {
          roomName: room.jitsiRoom,
          parentNode: containerRef.current,
          width: '100%',
          height: '100%',
          userInfo: { displayName },
          configOverwrite: { prejoinPageEnabled: false },
          interfaceConfigOverwrite: { MOBILE_APP_PROMO: false },
        });
      })
      .catch(() => { if (!cancelled) setFailed(true); });

    return () => {
      cancelled = true;
      try { apiRef.current?.dispose(); } catch { /* ignore */ }
      apiRef.current = null;
    };
  }, [room.jitsiRoom, displayName, retryKey]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900">
      <div className="flex h-14 shrink-0 items-center gap-3 bg-gray-950 px-4 text-white">
        <button
          type="button"
          onClick={() => navigateTo('/meeting')}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-semibold text-gray-200 hover:bg-white/10"
        >
          <ArrowLeft size={18} />
          {t('meeting.back')}
        </button>
        <span className="truncate text-sm font-bold">{title}</span>
      </div>

      {failed ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center text-white">
          <p className="max-w-sm text-sm text-gray-300">{t('meeting.loadError')}</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setFailed(false); setRetryKey((k) => k + 1); }}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-700"
            >
              {t('meeting.retry')}
            </button>
            <a
              href={`https://${JITSI_DOMAIN}/${room.jitsiRoom}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-white/30 px-4 py-2 text-sm font-semibold hover:bg-white/10"
            >
              {t('meeting.openNewTab')}
            </a>
          </div>
        </div>
      ) : (
        <div ref={containerRef} className="flex-1" />
      )}
    </div>
  );
};

export default MeetingRoom;
