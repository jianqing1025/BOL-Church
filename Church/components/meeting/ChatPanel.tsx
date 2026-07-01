import React from 'react';
import { X } from 'lucide-react';
import { useLocalization } from '../../hooks/useLocalization';
import { MessageList, type DisplayMessage } from './MessageList';
import { ChatInput } from './ChatInput';

interface ChatPanelProps {
  messages: DisplayMessage[];
  ownUserId: string | null;
  onSend: (text: string) => void;
  onClose: () => void;
}

/**
 * Chat surface. On mobile it is a bottom sheet covering the lower half of the
 * screen; on sm+ screens it becomes a static right-hand side panel.
 */
export const ChatPanel: React.FC<ChatPanelProps> = ({ messages, ownUserId, onSend, onClose }) => {
  const { t } = useLocalization();
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-20 flex h-[50vh] flex-col overflow-hidden rounded-t-2xl border-t border-white/10 bg-gray-900 shadow-2xl
                 sm:static sm:z-auto sm:h-auto sm:w-80 sm:shrink-0 sm:rounded-none sm:border-l sm:border-t-0 sm:shadow-none"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-2.5">
        <span className="text-sm font-bold text-gray-200">{t('meeting.chat')}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('meeting.close')}
          className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-white/10 hover:text-white"
        >
          <X size={18} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <MessageList messages={messages} ownUserId={ownUserId} />
        <ChatInput onSend={onSend} />
      </div>
    </div>
  );
};

export default ChatPanel;
