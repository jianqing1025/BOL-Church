import React, { useRef, useState } from 'react';
import { User, X } from 'lucide-react';
import type { Participant } from 'livekit-client';
import { useLocalization } from '../../hooks/useLocalization';
import { ParticipantTile } from './ParticipantTile';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The local participant as a floating, draggable, hideable picture-in-picture
 * window pinned to the bottom-right — it never affects the main grid layout.
 */
export const SelfViewPiP: React.FC<{ participant: Participant }> = ({ participant }) => {
  const { t } = useLocalization();
  const [hidden, setHidden] = useState(false);
  // Offsets from the bottom-right corner (px). Sits above the control bar.
  const [pos, setPos] = useState({ right: 16, bottom: 88 });
  const drag = useRef({ active: false, x: 0, y: 0, moved: false });

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { active: true, x: e.clientX, y: e.clientY, moved: false };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    drag.current.x = e.clientX;
    drag.current.y = e.clientY;
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.current.moved = true;
    setPos((p) => ({
      right: clamp(p.right - dx, 8, window.innerWidth - 120),
      bottom: clamp(p.bottom - dy, 8, window.innerHeight - 100),
    }));
  };
  const onPointerUp = () => { drag.current.active = false; };

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => setHidden(false)}
        aria-label={t('meeting.showSelfView')}
        className="absolute bottom-[88px] right-4 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-gray-800/90 text-white shadow-lg ring-1 ring-white/10 hover:bg-gray-700"
      >
        <User size={18} />
      </button>
    );
  }

  return (
    <div
      className="absolute z-30 w-32 touch-none select-none sm:w-44"
      style={{ right: pos.right, bottom: pos.bottom }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="aspect-video cursor-grab active:cursor-grabbing shadow-2xl">
        <ParticipantTile participant={participant} />
      </div>
      <button
        type="button"
        onClick={() => setHidden(true)}
        aria-label={t('meeting.hideSelfView')}
        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75"
      >
        <X size={13} />
      </button>
    </div>
  );
};

export default SelfViewPiP;
