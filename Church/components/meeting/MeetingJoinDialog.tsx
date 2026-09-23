import React, { useEffect, useState } from 'react';
import { Mic, Video as VideoIcon } from 'lucide-react';
import { useLocalization } from '../../hooks/useLocalization';
import { needsPermissionIntro } from '../../meeting/mediaPermission';
import { defaultJoinMedia, type JoinMedia } from '../../meeting/joinDefaults';

interface MeetingJoinDialogProps {
  roomName: string;
  /** People already in the room, or undefined while the count is unknown. */
  activeCount: number | undefined;
  onCancel: () => void;
  onJoin: (media: JoinMedia) => void;
}

const Toggle: React.FC<{
  label: string;
  icon: React.ReactNode;
  checked: boolean;
  onChange: (value: boolean) => void;
}> = ({ label, icon, checked, onChange }) => (
  <label className="flex flex-1 cursor-pointer items-center gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 shrink-0 cursor-pointer rounded border-gray-400 text-blue-600 focus:ring-blue-500"
    />
    <span className="shrink-0 text-gray-500">{icon}</span>
    <span className="truncate text-sm font-semibold text-gray-700">{label}</span>
  </label>
);

/**
 * The door to a room: what to arrive with.
 *
 * Shown every time rather than only the first, because the two boxes are a
 * decision about this room right now — a study already under way is one you
 * come into quietly, whether or not you have been here before.
 *
 * The boxes do not decide which permissions are asked for. Both devices are
 * always captured, in the single getUserMedia call iOS allows; the boxes
 * decide what is left open afterwards. Asking for them one at a time would
 * mean a second capture later, which on iOS stops the tracks of the first.
 * The note below says so, so that the browser's prompt is expected.
 */
export const MeetingJoinDialog: React.FC<MeetingJoinDialogProps> = ({ roomName, activeCount, onCancel, onJoin }) => {
  const { t } = useLocalization();
  const [media, setMedia] = useState<JoinMedia>(() => defaultJoinMedia(activeCount));
  const [explainPermission, setExplainPermission] = useState(false);

  const crowded = !defaultJoinMedia(activeCount).micOn;

  useEffect(() => {
    let cancelled = false;
    void needsPermissionIntro(['microphone', 'camera']).then((needed) => {
      if (!cancelled) setExplainPermission(needed);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 px-4 py-6">
      <div className="w-full max-w-md rounded-[10px] bg-white p-7 shadow-2xl">
        <h2 className="text-xl font-extrabold text-gray-800">
          {t('meeting.joinTitle').replace('{room}', roomName)}
        </h2>

        {crowded && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900">
            {t('meeting.joinCrowded')}
          </p>
        )}

        <div className="mt-5 flex gap-2.5">
          <Toggle
            label={t('meeting.joinCamera')}
            icon={<VideoIcon size={16} strokeWidth={1.5} />}
            checked={media.camOn}
            onChange={(camOn) => setMedia((m) => ({ ...m, camOn }))}
          />
          <Toggle
            label={t('meeting.joinMic')}
            icon={<Mic size={16} strokeWidth={1.5} />}
            checked={media.micOn}
            onChange={(micOn) => setMedia((m) => ({ ...m, micOn }))}
          />
        </div>

        {explainPermission && (
          <p className="mt-4 text-sm leading-6 text-gray-500">{t('meeting.joinPermissionNote')}</p>
        )}

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
            onClick={() => onJoin(media)}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-700"
          >
            {t('meeting.join')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MeetingJoinDialog;
