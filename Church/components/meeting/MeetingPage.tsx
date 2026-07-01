import React, { useEffect, useMemo, useState } from 'react';
import PageHeader from '../PageHeader';
import { useLocalization } from '../../hooks/useLocalization';
import { useAdmin } from '../../hooks/useAdmin';
import { buildMediaSlots } from '../../media';
import { navigateTo } from '../../utils/routes';
import { MEETING_ROOMS, findMeetingRoom } from '../../constants/meetingRooms';
import { MEETING_UNLOCK_KEY, MEETING_NAME_KEY } from './meetingAuth';
import { MeetingGate } from './MeetingGate';
import { MeetingCard } from './MeetingCard';
import { JoinNameModal } from './JoinNameModal';
import { MeetingRoom } from './MeetingRoom';

const readStored = (key: string): string => {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
};

export const MeetingPage: React.FC<{ roomKey?: string }> = ({ roomKey }) => {
  const { t } = useLocalization();
  const { images } = useAdmin();
  const [unlocked, setUnlocked] = useState<boolean>(() => readStored(MEETING_UNLOCK_KEY) === '1');
  const [name, setName] = useState<string>(() => readStored(MEETING_NAME_KEY));

  const room = findMeetingRoom(roomKey);
  const heroUrl = useMemo(() => {
    const slot = buildMediaSlots('hero', images)[0];
    return slot ? (images[slot.key] || slot.placeholder) : '';
  }, [images]);

  // Unknown ministry slug → return to the grid.
  useEffect(() => {
    if (roomKey && !room) navigateTo('/meeting', true);
  }, [roomKey, room]);

  if (!unlocked) {
    return <MeetingGate heroUrl={heroUrl} onUnlocked={() => setUnlocked(true)} />;
  }

  if (room) {
    if (!name) {
      return (
        <JoinNameModal
          roomTitle={t(room.titleKey)}
          onJoin={(n) => {
            try { localStorage.setItem(MEETING_NAME_KEY, n); } catch { /* ignore */ }
            setName(n);
          }}
          onClose={() => navigateTo('/meeting')}
        />
      );
    }
    return <MeetingRoom room={room} displayName={name} title={t(room.titleKey)} />;
  }

  return (
    <div>
      <PageHeader title={t('meeting.pageTitle')} subtitle={t('meeting.pageSubtitle')} />
      <div className="container mx-auto max-w-4xl px-6 py-16">
        <div className="grid gap-6 sm:grid-cols-2">
          {MEETING_ROOMS.map((r) => (
            <MeetingCard
              key={r.key}
              title={t(r.titleKey)}
              description={t(r.descKey)}
              onJoin={() => navigateTo(`/meeting/${r.key}`)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default MeetingPage;
