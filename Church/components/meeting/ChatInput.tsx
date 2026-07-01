import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { useLocalization } from '../../hooks/useLocalization';

interface ChatInputProps {
  disabled?: boolean;
  onSend: (text: string) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({ disabled, onSend }) => {
  const { t } = useLocalization();
  const [text, setText] = useState('');

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed.slice(0, 1000));
    setText('');
  };

  return (
    <div className="flex items-center gap-2 border-t border-white/10 bg-gray-900 p-3">
      <input
        type="text"
        value={text}
        maxLength={1000}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
        placeholder={t('meeting.inputPlaceholder')}
        className="flex-1 rounded-full border border-white/15 bg-gray-800 px-4 py-2.5 text-sm text-gray-100 placeholder:text-gray-500 focus:border-blue-500 focus:outline-none disabled:opacity-60"
      />
      <button
        type="button"
        onClick={submit}
        disabled={disabled || !text.trim()}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        aria-label={t('meeting.send')}
      >
        <Send size={18} />
      </button>
    </div>
  );
};

export default ChatInput;
