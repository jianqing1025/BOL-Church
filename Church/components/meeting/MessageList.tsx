import React, { useEffect, useRef, useState } from 'react';
import { SmilePlus } from 'lucide-react';
import type { ChatMessage, SystemMessage } from '../../meeting/chatProtocol';
import { useLocalization } from '../../hooks/useLocalization';
import { REACTION_EMOJI, reactionSummary } from '../../meeting/reactions';

export type DisplayMessage = ChatMessage | SystemMessage;

interface MessageListProps {
  messages: DisplayMessage[];
  ownUserId: string | null;
  onReact: (messageId: string, emoji: string) => void;
}

/**
 * The emoji a message already has, and the way to add one.
 *
 * The picker opens on a press rather than a hover: half the room is on a
 * phone, where there is no such thing as hovering, and a control that only
 * some people can reach is worse than one more button for everybody.
 */
const Reactions: React.FC<{
  messageId: string;
  reactions: Record<string, string[]> | undefined;
  ownUserId: string | null;
  own: boolean;
  onReact: (messageId: string, emoji: string) => void;
}> = ({ messageId, reactions, ownUserId, own, onReact }) => {
  const { t } = useLocalization();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pills = reactionSummary(reactions, ownUserId);

  return (
    <div className={`relative mt-1 flex items-center gap-1 ${own ? 'flex-row-reverse' : ''}`}>
      <button
        type="button"
        onClick={() => setPickerOpen((v) => !v)}
        aria-label={t('meeting.react')}
        aria-expanded={pickerOpen}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-white/10 hover:text-gray-200"
      >
        <SmilePlus size={14} strokeWidth={1.5} />
      </button>

      {pills.map((pill) => (
        <button
          key={pill.emoji}
          type="button"
          onClick={() => onReact(messageId, pill.emoji)}
          className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] leading-none transition-colors ${
            pill.mine ? 'bg-blue-600/25 text-blue-200 ring-1 ring-blue-400/60' : 'bg-white/10 text-gray-300 hover:bg-white/15'
          }`}
        >
          <span>{pill.emoji}</span>
          <span className="font-bold tabular-nums">{pill.count}</span>
        </button>
      ))}

      {pickerOpen && (
        <>
          {/* Catches the next press anywhere else, so the picker closes the
              way every other popup in the meeting does. */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setPickerOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />
          <div className={`absolute bottom-full z-40 mb-1 flex gap-0.5 rounded-full border border-white/10 bg-gray-800 px-1.5 py-1 shadow-xl ${own ? 'right-0' : 'left-0'}`}>
            {REACTION_EMOJI.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => { setPickerOpen(false); onReact(messageId, emoji); }}
                className="flex h-7 w-7 items-center justify-center rounded-full text-base transition-transform hover:scale-125"
              >
                {emoji}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export const MessageList: React.FC<MessageListProps> = ({ messages, ownUserId, onReact }) => {
  const { t } = useLocalization();
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  return (
    <div className="flex-1 space-y-2 overflow-y-auto p-4">
      {messages.map((m, i) => {
        if (m.type === 'system') {
          return (
            <div key={`sys-${i}-${m.createdAt}`} className="text-center text-xs text-gray-500">
              {'event' in m
                ? t(m.event === 'joined' ? 'meeting.memberJoined' : 'meeting.memberLeft').replace('{name}', m.name)
                : m.text}
            </div>
          );
        }
        const own = m.userId === ownUserId;
        return (
          <div key={m.id} className={`flex flex-col ${own ? 'items-end' : 'items-start'}`}>
            {!own && <span className="mb-0.5 text-xs font-semibold text-gray-400">{m.name}</span>}
            <div className={`max-w-[75%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
              own ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-100'
            }`}>
              {m.text}
            </div>
            <Reactions
              messageId={m.id}
              reactions={m.reactions}
              ownUserId={ownUserId}
              own={own}
              onReact={onReact}
            />
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
};

export default MessageList;
