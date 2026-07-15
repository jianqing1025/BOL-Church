import React, { useEffect, useRef } from 'react';
import type { ChatMessage, SystemMessage } from '../../meeting/chatProtocol';
import { useLocalization } from '../../hooks/useLocalization';

export type DisplayMessage = ChatMessage | SystemMessage;

interface MessageListProps {
  messages: DisplayMessage[];
  ownUserId: string | null;
}

export const MessageList: React.FC<MessageListProps> = ({ messages, ownUserId }) => {
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
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
};

export default MessageList;
